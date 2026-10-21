using Microsoft.AspNetCore.Http.HttpResults;
using __App__.Application.Common.Errors;
using __App__.Application.Common.Results;

namespace __App__.Api.Common;

public static class ResultExtensions
{
    public static JsonHttpResult<ApiResponse<T>> ToHttp<T>(this Result<T> result) =>
        result.Error is { } error ? Fail<T>(error) : TypedResults.Json(new ApiResponse<T>(true, result.Value, result.UiMessage, null));

    public static JsonHttpResult<ApiResponse<object>> ToHttp(this Result result) =>
        result.Error is { } error ? Fail<object>(error) : TypedResults.Json(new ApiResponse<object>(true, null, result.UiMessage, null));

    public static JsonHttpResult<ApiResponse<T>> Fail<T>(Error error) =>
        TypedResults.Json(new ApiResponse<T>(false, default, null, new ErrorData(error.Header, error.Message, error.Code)), statusCode: error.Code);

    /// <summary>Pipeline'ın kendi ürettiği hatalar (401, 404 rota, 400 gövde) için zarf yazar.</summary>
    public static Task WriteEnvelopeAsync(this HttpContext context, Error error)
    {
        context.Response.StatusCode = error.Code;
        return context.Response.WriteAsJsonAsync(
            new ApiResponse<object>(false, null, null, new ErrorData(error.Header, error.Message, error.Code)));
    }
}
