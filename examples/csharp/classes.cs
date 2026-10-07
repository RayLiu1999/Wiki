var notebook = new Notebook("C# 程式筆記");
Console.WriteLine(notebook.Title);

class Notebook
{
    public string Title { get; }

    public Notebook(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("標題不能是空白", nameof(title));

        Title = title;
    }
}
