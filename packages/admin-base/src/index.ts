export * from './contract/api.js';

export * from './schema/fields.js';
export * from './schema/resource.js';
export * from './schema/extend.js';
export * from './schema/relation.js';
export * from './schema/write.js';

export type { AtaRequestFlags } from './data/axiosFlags.js';
export * from './data/dataProvider.js';
export * from './data/restProvider.js';
export * from './data/resourceApi.js';
export * from './data/queryClient.js';

export * from './react/context.js';
export * from './react/hooks.js';

export { adminBaseTexts, adminBaseTextsEn, humanize, type AdminTextKey, type Translate } from './ui/texts.js';
export { useAdminTexts, fieldLabelKey } from './ui/useAdminTexts.js';
export { ResourcePage, type ResourcePageProps } from './ui/ResourcePage.js';
export { ResourceFormDrawer, type ResourceFormDrawerProps } from './ui/form/ResourceFormDrawer.js';
export { ResourceDetailDrawer, type ResourceDetailDrawerProps } from './ui/detail/ResourceDetailDrawer.js';
export { isColumnSortable } from './ui/table/columns.js';
export { RecordTable, type RecordTableProps, type RecordTableSearch } from './ui/table/RecordTable.js';
export { enumChoices, enumLabelOf, enumValueFromInput, type EnumChoice } from './ui/enumChoices.js';
export { FormFields, type FormFieldsProps } from './ui/form/FormFields.js';
export { formValuesToBody, initialFormValues, isFieldVisible, type FormMode } from './ui/form/values.js';
export { validateField } from './ui/form/rules.js';
export { FilterBar, type FilterBarProps } from './ui/filters/FilterBar.js';
export { buildListFilters, type FilterDraft } from './ui/filters/filterValues.js';
export { RelationAutocomplete, type RelationAutocompleteProps } from './ui/inputs/RelationAutocomplete.js';
export { AtaLoginPage, ATA_LOGIN_REMEMBER_KEY, type AtaLoginPageProps, type AtaLoginValues } from './ui/login/AtaLoginPage.js';
export { validateLogin, type LoginErrors } from './ui/login/loginForm.js';
export { createAdminRoutes, resourceTitleKey, type AdminRouteEntry, type CreateAdminRoutesOptions } from './ui/routes.js';
export { AdminDashboard, type AdminDashboardProps, type DashboardCard, type DashboardGraph, type DashboardGraphRange, type DashboardGraphSeries, type DashboardLink, type DashboardTable, type DashboardTableColumn } from './ui/dashboard/AdminDashboard.js';
export { groupDashboardGraphs } from './ui/dashboard/layout.js';
