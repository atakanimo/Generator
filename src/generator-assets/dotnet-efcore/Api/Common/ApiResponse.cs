using System.Text.Json.Serialization;

namespace __App__.Api.Common;

/// <summary>Sözleşme zarfı (api-contract §1). <c>TraceId</c> middleware doldurur; yoksa yazılmaz.</summary>
public sealed record ApiResponse<T>(bool IsSuccess, T? Data, string? UiMessage, ErrorData? ErrorData, string? TraceId = null);

public sealed record ErrorData(
    string Header,
    string Message,
    int Code,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Field = null);
