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
export { RecordTable, type RecordTableHeight, type RecordTableProps, type RecordTableSearch } from './ui/table/RecordTable.js';
export { ataGridSx, useAtaGridLocaleText, ATA_GRID_CELL_FILL } from './ui/table/gridStyles.js';
export { GridRowButtons, rowActionsWidth, type GridRowButton, type GridRowButtonsProps } from './ui/table/gridCells.js';
export { RowActionIcon, type RowActionIconProps } from './ui/actions/actions.js';
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
export { AtaAdminLayout, ATA_DRAWER_WIDTH, ATA_TOOLBAR_HEIGHT, type AtaAdminLayoutProps, type AtaAdminNavItem } from './ui/layout/AtaAdminLayout.js';
export { AtaAdminPage, AtaAdminFill, ataAdminPageSx, ataAdminScrollPageSx, ataAdminFillSx, type AtaAdminPageProps, type AtaAdminFillProps } from './ui/layout/AtaAdminPage.js';
export { groupDashboardGraphs } from './ui/dashboard/layout.js';
