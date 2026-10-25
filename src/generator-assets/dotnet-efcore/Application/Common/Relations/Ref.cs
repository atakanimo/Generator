namespace __App__.Application.Common.Relations;

/// <summary>
/// Row'daki ilişki alanı: <see cref="Value"/> doluysa populate edilmiş obje, boşsa yalnızca id (JSON'da string).
/// list / getOne doldurur, create / update id döner (sözleşme §4, Express ile aynı).
/// </summary>
public sealed record Ref<T>(EntityId Id, T? Value) where T : class;
