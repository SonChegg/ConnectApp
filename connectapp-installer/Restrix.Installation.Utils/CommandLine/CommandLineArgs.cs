namespace Restrix.Installation.Utils.CommandLine;

public sealed class CommandLineArgs
{
    private readonly Dictionary<string, string?> _values;

    public CommandLineArgs(Dictionary<string, string?> values)
    {
        _values = values;
    }

    public bool HasFlag(string key) => _values.ContainsKey(key);

    public string? GetValue(string key) =>
        _values.TryGetValue(key, out var value) ? value : null;
}
