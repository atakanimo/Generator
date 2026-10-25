namespace __App__.Application.Common.Abstractions;

public interface ICurrentUser
{
    EntityId? Id { get; }
    bool IsAuthenticated { get; }
    bool IsAdmin { get; }
}
