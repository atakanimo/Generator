namespace __App__.Application.Common.Abstractions;

public interface ICurrentUser
{
    Guid? Id { get; }
    bool IsAuthenticated { get; }
    bool IsAdmin { get; }
}
