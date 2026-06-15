import Handlebars from 'handlebars';
import {
  emitFeCoreTextJsx,
  FE_TEXT_VARIANT,
  type FeCoreTextEmitOptions,
} from '../../shared/feTypography.js';

export function registerFeCoreTextHelpers(): void {
  Handlebars.registerHelper('feCoreText', (options: Handlebars.HelperOptions) => {
    const hash = options.hash as Record<string, unknown>;
    const variant = String(hash.variant ?? FE_TEXT_VARIANT.tableCell);
    const children = options.fn ? String(options.fn(options.data?.root ?? {})).trim() : String(hash.children ?? '');
    const emit: FeCoreTextEmitOptions = {
      variant,
      children,
      component: hash.component ? String(hash.component) : undefined,
      noWrap: hash.noWrap === true || hash.noWrap === 'true',
      sx: hash.sx ? String(hash.sx) : undefined,
    };
    return new Handlebars.SafeString(emitFeCoreTextJsx(emit));
  });

  Handlebars.registerHelper('feCoreTextLiteral', (variant: unknown, text: unknown, hash?: Record<string, unknown>) => {
    const h = (hash && typeof hash === 'object' ? hash : {}) as Record<string, unknown>;
    const line = emitFeCoreTextJsx({
      variant: String(variant ?? FE_TEXT_VARIANT.tableCell),
      children: String(text ?? ''),
      component: h.component ? String(h.component) : undefined,
      noWrap: h.noWrap === true || h.noWrap === 'true',
      sx: h.sx ? String(h.sx) : undefined,
    });
    return new Handlebars.SafeString(line);
  });
}

export {
  emitFeCoreTextJsx,
  emitFeCoreTextCellDisplay,
  emitFeRelationCellValueExpr,
  FE_TEXT_VARIANT,
} from '../../shared/feTypography.js';
