"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const wine_1 = require("../src/wine");
(0, node_test_1.test)('removes Wine diagnostic lines and preserves useful output', () => {
    const output = 'fixme:unimplemented call\nDesigner started\nerr:ignored detail\n';
    strict_1.default.equal((0, wine_1.stripWineNoise)(output), 'Designer started');
});
(0, node_test_1.test)('matches diagnostic prefixes case-insensitively with leading whitespace', () => {
    const output = '  WARN: noisy\nTRACE: noisy\nUseful failure';
    strict_1.default.equal((0, wine_1.stripWineNoise)(output), 'Useful failure');
});
(0, node_test_1.test)('returns an empty string when output contains only Wine diagnostics', () => {
    strict_1.default.equal((0, wine_1.stripWineNoise)('wine: noise\nfixme: more noise\n'), '');
});
//# sourceMappingURL=wine.test.js.map