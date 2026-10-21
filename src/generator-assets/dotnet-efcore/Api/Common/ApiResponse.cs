namespace __App__.Api.Common;

/// <summary>Sözleşme zarfı (api-contract §1).</summary>
public sealed record ApiResponse<T>(bool IsSuccess, T? Data, string? UiMessage, ErrorData? ErrorData);

public sealed record ErrorData(string Header, string Message, int Code);
