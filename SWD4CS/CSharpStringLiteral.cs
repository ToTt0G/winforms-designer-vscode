using System.Globalization;
using System.Text;

namespace SWD4CS;

// Only string literals are interpreted here. Other property expressions are
// retained for the existing property converters; no input code is executed.
internal static class CSharpStringLiteral
{
    internal static string Encode(string value)
    {
        var result = new StringBuilder("\"");
        foreach (char character in value)
        {
            result.Append(character switch
            {
                '\\' => "\\\\", '"' => "\\\"", '\n' => "\\n", '\r' => "\\r", '\t' => "\\t",
                _ when char.IsControl(character) || character is '\u2028' or '\u2029' => "\\u" + ((int)character).ToString("X4", CultureInfo.InvariantCulture),
                _ => character.ToString()
            });
        }
        return result.Append('"').ToString();
    }

    internal static string Decode(string expression)
    {
        if (expression.StartsWith("@\"", StringComparison.Ordinal) && expression.EndsWith('"'))
        {
            return expression[2..^1].Replace("\"\"", "\"");
        }
        if (expression.Length < 2 || expression[0] != '"' || expression[^1] != '"') { return expression; }

        var result = new StringBuilder();
        for (int i = 1; i < expression.Length - 1; i++)
        {
            char character = expression[i];
            if (character != '\\')
            {
                if (character == '"') { throw new FormatException("Expected a single C# string literal."); }
                result.Append(character);
                continue;
            }
            if (++i >= expression.Length - 1) { throw new FormatException("Incomplete C# string escape."); }
            char escape = expression[i];
            if (escape is 'u' or 'U' or 'x')
            {
                int start = i + 1;
                int length = escape == 'U' ? 8 : 4;
                if (escape == 'x')
                {
                    length = 0;
                    while (length < 4 && start + length < expression.Length - 1 && Uri.IsHexDigit(expression[start + length])) { length++; }
                }
                if (length == 0 || start + length > expression.Length - 1 ||
                    !uint.TryParse(expression.Substring(start, length), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out uint code))
                { throw new FormatException("Invalid hexadecimal C# string escape."); }
                if (escape == 'U')
                {
                    if (code > 0x10FFFF || code is >= 0xD800 and <= 0xDFFF) { throw new FormatException("Invalid Unicode scalar."); }
                    result.Append(char.ConvertFromUtf32((int)code));
                }
                else { result.Append((char)code); }
                i += length;
                continue;
            }
            result.Append(escape switch
            {
                '\\' => '\\', '"' => '"', '\'' => '\'', '0' => '\0', 'a' => '\a', 'b' => '\b',
                'f' => '\f', 'n' => '\n', 'r' => '\r', 't' => '\t', 'v' => '\v',
                _ => throw new FormatException("Unknown C# string escape.")
            });
        }
        return result.ToString();
    }
}
