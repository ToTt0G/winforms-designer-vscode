// Typed Extension Host <-> Webview Message Protocol

import type {
  CodeBehindMethod,
  DesignDocument,
  DesignerSettings,
  ResourceValue,
} from './model';

export type ThemeKind = 'dark' | 'light' | 'high-contrast';

/** Shared BCP-47 culture tag validator used by both the extension host and webview. */
export const CULTURE_TAG_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;

export function isValidCultureTag(tag: string): boolean {
  if (!tag) return false;
  if (tag.toLowerCase() === 'default') return false;
  return CULTURE_TAG_RE.test(tag);
}

export type HostToWebviewMessage =
  | {
      type: 'init';
      document: DesignDocument;
      documentVersion?: number;
      settings: DesignerSettings;
      fileName: string;
      codeBehindFileName?: string;
      hasCodeBehind: boolean;
      codeBehindHandlers: CodeBehindMethod[];
      themeKind: ThemeKind;
      resourceDataUris: Record<string, string>;
      hasProject?: boolean;
      availableCultures?: string[];
      activeCulture?: string;
      cultureStrings?: Record<string, string>;
    }
  | {
      type: 'documentUpdated';
      document: DesignDocument;
      documentVersion?: number;
      codeBehindHandlers: CodeBehindMethod[];
      resourceDataUris: Record<string, string>;
      source: 'external' | 'host';
      reason?: 'external' | 'undo' | 'redo' | 'conflict' | 'rejected';
      availableCultures?: string[];
      activeCulture?: string;
      cultureStrings?: Record<string, string>;
    }
  | {
      type: 'applyAck';
      revision: number;
      documentVersion: number;
      accepted: boolean;
      reason?: string;
    }
  | {
      type: 'settingsChanged';
      settings: DesignerSettings;
    }
  | {
      type: 'themeChanged';
      themeKind: ThemeKind;
    }
  | {
      type: 'imagePicked';
      requestId: string;
      resource?: ResourceValue;
      dataUri?: string;
      cancelled?: boolean;
      error?: string;
    }
  | {
      type: 'eventHandlerReady';
      nodeId: string;
      eventName: string;
      methodName: string;
      codeBehindHandlers: CodeBehindMethod[];
      success?: boolean;
      error?: string;
    }
  | {
      type: 'command';
      command:
        | 'undo'
        | 'redo'
        | 'toggleTabOrder'
        | 'toggleGrid'
        | 'toggleSnaplines'
        | 'zoomIn'
        | 'zoomOut'
        | 'zoomReset';
    }
  | {
      type: 'showStarPrompt';
      repoUrl: string;
    }
  | {
      type: 'cultureChanged';
      activeCulture: string;
      availableCultures: string[];
      cultureStrings: Record<string, string>;
    };

export type WebviewToHostMessage =
  | { type: 'ready' }
  | {
      type: 'applyDocument';
      document: DesignDocument;
      description?: string;
      baseDocumentVersion?: number;
      revision?: number;
    }
  | {
      type: 'navigateToEvent';
      nodeId: string;
      controlName: string;
      controlType: string;
      eventName: string;
      methodName: string;
      createIfMissing: boolean;
    }
  | {
      type: 'viewCode';
      beside?: boolean;
    }
  | {
      type: 'viewDesignerCode';
      beside?: boolean;
    }
  | {
      type: 'pickImage';
      requestId: string;
      nodeId: string;
      controlName: string;
      propertyName: string;
      acceptIcon?: boolean;
    }
  | {
      type: 'clearImage';
      nodeId: string;
      propertyName: string;
      resourceName?: string;
    }
  | {
      type: 'showMessage';
      level: 'info' | 'warning' | 'error';
      message: string;
    }
  | {
      type: 'updateSetting';
      key: keyof DesignerSettings;
      value: unknown;
    }
  | {
      type: 'starPromptAction';
      action: 'star' | 'later' | 'dismiss';
    }
  | {
      type: 'switchCulture';
      culture: string;
    }
  | {
      type: 'addCulture';
      culture: string;
    }
  | {
      type: 'setCultureValue';
      culture: string;
      key: string;
      value: string;
    }
  | {
      type: 'runProjectAction';
      action: 'build' | 'run';
    };
