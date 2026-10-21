using FluentValidation;
using __App__.Application.Common.Errors;

namespace __App__.Application.Common.Pagination;

/// <summary>Ortak liste kuralları: <c>page</c> ≥ 1, <c>sortBy</c> beyaz listede. <c>limit</c> doğrulanmaz, sıkıştırılır.</summary>
public abstract class ListBodyValidator<TFilters> : AbstractValidator<ListBody<TFilters>> where TFilters : class
{
    protected ListBodyValidator(IReadOnlyCollection<string> sortKeys)
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1).When(x => x.Page is not null);
        RuleFor(x => x.SortBy)
            .Must(s => s is null || sortKeys.Contains(s))
            .WithMessage(x => string.Format(Messages.InvalidSort, x.SortBy));
    }
}
