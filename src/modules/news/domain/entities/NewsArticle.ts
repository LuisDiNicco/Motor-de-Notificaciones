export class NewsArticle {
  public id?: string;

  constructor(
    public readonly title: string,
    public readonly url: string,
    public readonly publishedAt: Date,
    public readonly source: string,
    public readonly category: string | null = null,
    public readonly mentionedTickers: string[] = [],
  ) {}
}
