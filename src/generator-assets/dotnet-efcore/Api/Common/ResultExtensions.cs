using __App__.Application.Common.Errors;
using __App__.Application.Common.Results;

namespace __App__.Api.Common;

public static class ResultExtensions
{
    public static IResult ToHttp<T>(this Result<T> result) => new ContractHttpResult<T>(result);

    public static IResult ToHttp(this Result result) => new PlainContractResult(result);

    public static IResult Fail<T>(Error error) => new ContractHttpResult<T>(Result.Fail<T>(error));

    /// <summary>Pipeline'ın kendi ürettiği hatalar (401, 404 rota, 400 gövde) için sözleşme cevabı yazar.</summary>
    public static Task WriteContractAsync(this HttpContext context, Error error)
    {
        context.Response.StatusCode = error.Code;
        return context.Response.WriteAsJsonAsync(
            new ApiResponse<object>(false, null, null, new ErrorData(error.Header, error.Message, error.Code), TraceId.Current(context)));
    }

    private sealed class PlainContractResult(Result result) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            var traceId = TraceId.Current(httpContext);
            if (result.Error is { } error)
            {
                httpContext.Response.StatusCode = error.Code;
                return httpContext.Response.WriteAsJsonAsync(
                    new ApiResponse<object>(false, null, null, new ErrorData(error.Header, error.Message, error.Code), traceId),
                    httpContext.RequestAborted);
            }

            return httpContext.Response.WriteAsJsonAsync(
                new ApiResponse<object>(true, null, result.UiMessage, null, traceId),
                httpContext.RequestAborted);
        }
    }

    private sealed class ContractHttpResult<T>(Result<T> result) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            var traceId = TraceId.Current(httpContext);
            if (result.Error is { } error)
            {
                httpContext.Response.StatusCode = error.Code;
                return httpContext.Response.WriteAsJsonAsync(
                    new ApiResponse<T>(false, default, null, new ErrorData(error.Header, error.Message, error.Code), traceId),
                    httpContext.RequestAborted);
            }

            return httpContext.Response.WriteAsJsonAsync(
                new ApiResponse<T>(true, result.Value, result.UiMessage, null, traceId),
                httpContext.RequestAborted);
        }
    }
}
