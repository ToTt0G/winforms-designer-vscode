// Core WinForms C# Parser, Serializer, Code-Behind Patcher, ResX Manager, and Scaffolder API

export {
  decodeCSharpString,
  encodeCSharpString,
  isCSharpStringLiteral,
} from './stringLiteral';

export {
  findMatchingBrace,
  findMatchingDelimiter,
  splitStatements,
  tokenizeCSharp,
  type StatementSlice,
  type Token,
  type TokenKind,
} from './lexer';

export {
  decodeDotNetDecimalBits,
  doesRawDataBindingMatchEntry,
  extractExtenderValues,
  parseDesignerCs,
  setExtenderValue,
  type ExtenderEntry,
  type ParseDesignerOptions,
} from './parser';

export { generateDesignerCs } from './generator';

export {
  ensureEventHandlerInCodeBehind,
  parseCodeBehind,
  type EnsureEventHandlerRequest,
  type EnsureEventHandlerResult,
} from './codeBehind';

export {
  createEmptyResx,
  parseResx,
  removeResxResource,
  updateResxResource,
} from './resx';

export {
  FORM_TEMPLATES,
  scaffoldFormFiles,
  scaffoldWinFormsProject,
  type FormTemplateId,
  type FormTemplateMetadata,
  type ScaffoldedProjectFiles,
  type ScaffoldFormOptions,
  type ScaffoldProjectOptions,
  type WinFormsTargetFramework,
} from './scaffold';

export {
  auditDesignDocument,
  type AuditRuleCode,
  type AuditSeverity,
  type DesignAuditIssue,
} from './auditor';
