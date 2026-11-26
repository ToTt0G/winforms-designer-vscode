import * as vscode from 'vscode';
import type { DesignerSettings } from '../shared/model';
import type { ThemeKind } from '../shared/protocol';

const SECTION = 'winformsDesigner';

export const DEFAULT_DESIGNER_SETTINGS: Readonly<DesignerSettings> = Object.freeze({
  gridSize: 8,
  layoutMode: 'snaplines',
  showGrid: true,
  renderStyle: 'fluent',
  useThisQualifier: 'auto',
  eventHandlerStyle: 'auto',
});

export const SETTING_KEY_TO_CONFIG_PATH: Readonly<Record<keyof DesignerSettings, string>> =
  Object.freeze({
    gridSize: 'gridSize',
    layoutMode: 'layoutMode',
    showGrid: 'showGrid',
    renderStyle: 'renderStyle',
    useThisQualifier: 'codeStyle.useThisQualifier',
    eventHandlerStyle: 'codeStyle.eventHandlerStyle',
  });

const VALID_GRID_SIZES = new Set<number>([4, 8, 12, 16]);
const VALID_LAYOUT_MODES = new Set<DesignerSettings['layoutMode']>(['snaplines', 'grid']);
const VALID_RENDER_STYLES = new Set<DesignerSettings['renderStyle']>(['fluent', 'classic']);
const VALID_USE_THIS = new Set<DesignerSettings['useThisQualifier']>(['auto', 'always', 'never']);
const VALID_EVENT_STYLES = new Set<DesignerSettings['eventHandlerStyle']>([
  'auto',
  'shorthand',
  'explicitDelegate',
]);

export function getDesignerSettings(resource?: vscode.Uri): DesignerSettings {
  const cfg = vscode.workspace.getConfiguration(SECTION, resource);

  const rawGridSize = cfg.get<number>('gridSize', DEFAULT_DESIGNER_SETTINGS.gridSize);
  const gridSize =
    typeof rawGridSize === 'number' && VALID_GRID_SIZES.has(rawGridSize)
      ? rawGridSize
      : DEFAULT_DESIGNER_SETTINGS.gridSize;

  const rawLayoutMode = cfg.get<string>('layoutMode', DEFAULT_DESIGNER_SETTINGS.layoutMode);
  const layoutMode: DesignerSettings['layoutMode'] = VALID_LAYOUT_MODES.has(
    rawLayoutMode as DesignerSettings['layoutMode']
  )
    ? (rawLayoutMode as DesignerSettings['layoutMode'])
    : DEFAULT_DESIGNER_SETTINGS.layoutMode;

  const rawShowGrid = cfg.get<boolean>('showGrid', DEFAULT_DESIGNER_SETTINGS.showGrid);
  const showGrid =
    typeof rawShowGrid === 'boolean' ? rawShowGrid : DEFAULT_DESIGNER_SETTINGS.showGrid;

  const rawRenderStyle = cfg.get<string>('renderStyle', DEFAULT_DESIGNER_SETTINGS.renderStyle);
  const renderStyle: DesignerSettings['renderStyle'] = VALID_RENDER_STYLES.has(
    rawRenderStyle as DesignerSettings['renderStyle']
  )
    ? (rawRenderStyle as DesignerSettings['renderStyle'])
    : DEFAULT_DESIGNER_SETTINGS.renderStyle;

  const rawUseThis = cfg.get<string>(
    'codeStyle.useThisQualifier',
    DEFAULT_DESIGNER_SETTINGS.useThisQualifier
  );
  const useThisQualifier: DesignerSettings['useThisQualifier'] = VALID_USE_THIS.has(
    rawUseThis as DesignerSettings['useThisQualifier']
  )
    ? (rawUseThis as DesignerSettings['useThisQualifier'])
    : DEFAULT_DESIGNER_SETTINGS.useThisQualifier;

  const rawEventStyle = cfg.get<string>(
    'codeStyle.eventHandlerStyle',
    DEFAULT_DESIGNER_SETTINGS.eventHandlerStyle
  );
  const eventHandlerStyle: DesignerSettings['eventHandlerStyle'] = VALID_EVENT_STYLES.has(
    rawEventStyle as DesignerSettings['eventHandlerStyle']
  )
    ? (rawEventStyle as DesignerSettings['eventHandlerStyle'])
    : DEFAULT_DESIGNER_SETTINGS.eventHandlerStyle;

  return {
    gridSize,
    layoutMode,
    showGrid,
    renderStyle,
    useThisQualifier,
    eventHandlerStyle,
  };
}

export async function updateDesignerSetting(
  key: keyof DesignerSettings,
  value: unknown,
  resource?: vscode.Uri
): Promise<void> {
  const configPath = SETTING_KEY_TO_CONFIG_PATH[key];
  if (!configPath) {
    return;
  }

  // Basic runtime validation to avoid writing corrupt setting values from webview messages
  if (!isValidSettingValue(key, value)) {
    return;
  }

  const cfg = vscode.workspace.getConfiguration(SECTION, resource);
  const inspected = typeof cfg.inspect === 'function' ? cfg.inspect(configPath) : undefined;

  let target = vscode.ConfigurationTarget.Global;
  if (inspected?.workspaceFolderValue !== undefined) {
    target = vscode.ConfigurationTarget.WorkspaceFolder;
  } else if (
    inspected?.workspaceValue !== undefined &&
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    target = vscode.ConfigurationTarget.Workspace;
  }

  await cfg.update(configPath, value, target);
}

function isValidSettingValue(key: keyof DesignerSettings, value: unknown): boolean {
  switch (key) {
    case 'gridSize':
      return typeof value === 'number' && VALID_GRID_SIZES.has(value);
    case 'layoutMode':
      return (
        typeof value === 'string' &&
        VALID_LAYOUT_MODES.has(value as DesignerSettings['layoutMode'])
      );
    case 'showGrid':
      return typeof value === 'boolean';
    case 'renderStyle':
      return (
        typeof value === 'string' &&
        VALID_RENDER_STYLES.has(value as DesignerSettings['renderStyle'])
      );
    case 'useThisQualifier':
      return (
        typeof value === 'string' &&
        VALID_USE_THIS.has(value as DesignerSettings['useThisQualifier'])
      );
    case 'eventHandlerStyle':
      return (
        typeof value === 'string' &&
        VALID_EVENT_STYLES.has(value as DesignerSettings['eventHandlerStyle'])
      );
    default:
      return false;
  }
}

export function getThemeKind(theme: vscode.ColorTheme): ThemeKind {
  switch (theme.kind) {
    case vscode.ColorThemeKind.Light:
      return 'light';
    case vscode.ColorThemeKind.HighContrast:
    case vscode.ColorThemeKind.HighContrastLight:
      return 'high-contrast';
    case vscode.ColorThemeKind.Dark:
    default:
      return 'dark';
  }
}
