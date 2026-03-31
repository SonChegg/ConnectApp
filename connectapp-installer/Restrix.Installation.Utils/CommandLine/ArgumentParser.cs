namespace Restrix.Installation.Utils.CommandLine;

public static class ArgumentParser
{
    public static CommandLineArgs Parse(string[] args)
    {
        var values = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);

        foreach (var arg in args)
        {
            if (string.IsNullOrWhiteSpace(arg))
            {
                continue;
            }

            var trimmed = arg.Trim();
            if (trimmed.StartsWith("/") || trimmed.StartsWith("-"))
            {
                trimmed = trimmed[1..];
            }

            if (string.IsNullOrWhiteSpace(trimmed))
            {
                continue;
            }

            var parts = trimmed.Split('=', 2, StringSplitOptions.RemoveEmptyEntries);
            var key = parts[0].Trim();
            var value = parts.Length > 1 ? parts[1].Trim().Trim('"') : null;

            values[key] = value;
        }

        return new CommandLineArgs(values);
    }
}
