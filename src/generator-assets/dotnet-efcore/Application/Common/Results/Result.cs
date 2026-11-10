using __App__.Application.Common.Errors;

namespace __App__.Application.Common.Results;

/// <summary>Servis sonucu. Api katmanı zarfa (<c>ApiResponse</c>) ve HTTP koduna çevirir.</summary>
public class Result
{
    protected Result(Error? error, string? uiMessage)
    {
        Error = error;
        UiMessage = uiMessage;
    }

    public Error? Error { get; }
    public string? UiMessage { get; }
    public bool IsSuccess => Error is null;

    public static Result Ok(string? uiMessage = null) => new(null, uiMessage ?? Messages.Success);
    public static Result Fail(Error error) => new(error, null);
    public static implicit operator Result(Error error) => Fail(error);
    public static Result<T> Ok<T>(T value, string? uiMessage = null) => new(value, null, uiMessage ?? Messages.Success);
    public static Result<T> Fail<T>(Error error) => new(default, error, null);
}

public sealed class Result<T> : Result
{
    internal Result(T? value, Error? error, string? uiMessage) : base(error, uiMessage) => Value = value;

    public T? Value { get; }

    public static implicit operator Result<T>(Error error) => Fail<T>(error);
}
