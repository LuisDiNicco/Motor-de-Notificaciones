#!/usr/bin/env node

/**
 * Docker Setup Script for Development Environment
 * 
 * This script follows the container best practices from development_rules.md:
 * - Ensures Docker is available and running
 * - Creates .env file from template if missing
 * - Starts required containers (PostgreSQL, Redis, RabbitMQ)
 * - Waits for health checks to pass before returning
 * 
 * Usage: node scripts/docker-setup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE_FILE = path.join(ROOT_DIR, '.env.example');
const DOCKER_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.yml');

const SERVICES = ['postgres', 'redis', 'rabbitmq'];
const MAX_WAIT_TIME = 60000; // 60 seconds
const HEALTH_CHECK_INTERVAL = 2000; // 2 seconds

/**
 * Log with timestamp
 */
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const icon = {
    INFO: 'ℹ️ ',
    SUCCESS: '✅',
    ERROR: '❌',
    WARN: '⚠️ ',
  }[type] || '•';
  console.log(`${icon} [${timestamp}] ${message}`);
}

/**
 * Check if Docker is available
 */
function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    log('Docker is available', 'SUCCESS');
    return true;
  } catch (error) {
    log('Docker is not installed or not in PATH', 'ERROR');
    return false;
  }
}

/**
 * Check if Docker daemon is running
 */
function checkDockerDaemon() {
  try {
    execSync('docker ps', { stdio: 'pipe' });
    log('Docker daemon is running', 'SUCCESS');
    return true;
  } catch (error) {
    log('Docker daemon is not running. Please start Docker.', 'ERROR');
    return false;
  }
}

/**
 * Create .env file from .env.example if it doesn't exist
 */
function ensureEnvFile() {
  if (fs.existsSync(ENV_FILE)) {
    log('.env file already exists', 'INFO');
    return true;
  }

  if (!fs.existsSync(ENV_EXAMPLE_FILE)) {
    log('.env.example not found', 'ERROR');
    return false;
  }

  try {
    const envContent = fs.readFileSync(ENV_EXAMPLE_FILE, 'utf8');
    fs.writeFileSync(ENV_FILE, envContent);
    log('.env file created from .env.example', 'SUCCESS');
    return true;
  } catch (error) {
    log(`Failed to create .env file: ${error.message}`, 'ERROR');
    return false;
  }
}

/**
 * Check if docker-compose.yml exists
 */
function checkDockerComposeFile() {
  if (fs.existsSync(DOCKER_COMPOSE_FILE)) {
    log('docker-compose.yml found', 'SUCCESS');
    return true;
  }
  log('docker-compose.yml not found', 'ERROR');
  return false;
}

/**
 * Get container status
 */
function getContainerStatus(service) {
  try {
    const result = execSync(
      `docker compose -f "${DOCKER_COMPOSE_FILE}" ps ${service} --format=json`,
      { cwd: ROOT_DIR, encoding: 'utf8' }
    );
    if (!result || !result.trim()) {
      return null;
    }

    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      return parsed[0] ?? null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

/**
 * Parse conflicting container names from docker compose error output
 */
function extractConflictingContainerNames(output) {
  const matches = [...output.matchAll(/container name "(\/[^"]+)"/g)];
  const names = matches
    .map((match) => match[1])
    .filter(Boolean)
    .map((name) => name.replace(/^\//, ''));

  return [...new Set(names)];
}

/**
 * Remove conflicting container so compose can recreate it
 */
function removeContainer(containerName) {
  try {
    execSync(`docker rm -f ${containerName}`, {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    });
    log(`Removed conflicting container: ${containerName}`, 'WARN');
    return true;
  } catch (error) {
    log(`Failed to remove conflicting container ${containerName}: ${error.message}`, 'ERROR');
    return false;
  }
}

/**
 * Wait for all services to be healthy
 */
async function waitForServices() {
  log('Waiting for services to be healthy...', 'INFO');
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_TIME) {
    let allHealthy = true;

    for (const service of SERVICES) {
      const container = getContainerStatus(service);
      if (!container) {
        allHealthy = false;
        process.stdout.write(`.`);
        continue;
      }

      const isHealthy = container.State === 'running' && 
        (container.Health === 'healthy' || container.Health === undefined);
      
      if (!isHealthy) {
        allHealthy = false;
      }
    }

    if (allHealthy) {
      console.log(); // New line after dots
      log('All services are healthy!', 'SUCCESS');
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }

  console.log(); // New line after dots
  log('Services did not become healthy within timeout', 'WARN');
  return false;
}

/**
 * Start Docker containers
 */
function startContainers() {
  const composeCommand = `docker compose -f "${DOCKER_COMPOSE_FILE}" up -d`;

  const runComposeUp = () => {
    try {
      const output = execSync(composeCommand, {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        stdio: 'pipe',
      });

      if (output?.trim()) {
        process.stdout.write(output);
      }

      return { success: true, output: output ?? '' };
    } catch (error) {
      const output = [
        error.stdout ? String(error.stdout) : '',
        error.stderr ? String(error.stderr) : '',
        error.message,
      ]
        .filter(Boolean)
        .join('\n');

      if (output.trim()) {
        console.error(output);
      }

      return { success: false, output, error };
    }
  };

  log('Starting Docker containers...', 'INFO');
  const maxRecoveryAttempts = 5;

  for (let attempt = 1; attempt <= maxRecoveryAttempts + 1; attempt += 1) {
    const result = runComposeUp();
    if (result.success) {
      return true;
    }

    const conflictingContainers = extractConflictingContainerNames(result.output);

    if (conflictingContainers.length === 0) {
      log(`Failed to start containers: ${result.error.message}`, 'ERROR');
      return false;
    }

    if (attempt > maxRecoveryAttempts) {
      log(
        `Failed after ${maxRecoveryAttempts} automatic conflict recovery attempts`,
        'ERROR',
      );
      return false;
    }

    log(
      `Detected container name conflicts: ${conflictingContainers.join(', ')}. Attempting automatic recovery (${attempt}/${maxRecoveryAttempts})...`,
      'WARN',
    );

    const allRemoved = conflictingContainers.map(removeContainer).every(Boolean);
    if (!allRemoved) {
      return false;
    }

    log('Retrying Docker container startup after conflict cleanup...', 'INFO');
  }

  return false;
}

/**
 * Pull latest images
 */
function pullImages() {
  try {
    log('Pulling latest images...', 'INFO');
    execSync(`docker compose -f "${DOCKER_COMPOSE_FILE}" pull`, {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    });
    log('Images pulled successfully', 'SUCCESS');
    return true;
  } catch (error) {
    log(`Warning: Failed to pull images: ${error.message}`, 'WARN');
    return true; // Don't fail on pull error, local images might be fine
  }
}

/**
 * Main setup function
 */
async function setup() {
  console.log('\n🐳 Docker Setup for Development Environment\n');
  console.log('Following best practices from development_rules.md\n');

  // Check prerequisites
  if (!checkDocker()) {
    process.exit(1);
  }

  if (!checkDockerDaemon()) {
    process.exit(1);
  }

  if (!checkDockerComposeFile()) {
    process.exit(1);
  }

  if (!ensureEnvFile()) {
    process.exit(1);
  }

  console.log('');

  // Check if containers are already running
  try {
    const result = execSync(`docker compose -f "${DOCKER_COMPOSE_FILE}" ps --services --filter "status=running"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    });
    
    const runningServices = result.trim().split('\n').filter(s => s);
    if (runningServices.length === SERVICES.length) {
      log('All services are already running!', 'SUCCESS');
      return true;
    }
  } catch (error) {
    // Containers not running, continue with startup
  }

  // Pull images and start containers
  if (!pullImages()) {
    process.exit(1);
  }

  if (!startContainers()) {
    process.exit(1);
  }

  // Wait for services to be healthy
  const healthy = await waitForServices();
  
  if (!healthy) {
    log('Some services may not be fully ready, but attempting to proceed...', 'WARN');
  }

  console.log('\n✨ Environment is ready!\n');
  console.log('Service URLs:');
  console.log('  - PostgreSQL:  postgresql://postgres:postgres@localhost:5432/noticore');
  console.log('  - Redis:       redis://localhost:6379');
  console.log('  - RabbitMQ:    amqp://guest:guest@localhost:5672');
  console.log('  - RabbitMQ UI: http://localhost:15672 (guest/guest)\n');

  return true;
}

// Run setup
setup()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log(`Unexpected error: ${error.message}`, 'ERROR');
    process.exit(1);
  });
