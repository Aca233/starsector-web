import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {dependencyGraph} from './lib/dependency-graph.mjs';

// Shared Modal owns global keyboard and focus. A page using it must not also
// register a global Escape/Tab owner; page-specific shortcuts remain allowed.
const graph = dependencyGraph(process.cwd(), ['src/ui', 'src/studio', 'src/network']);
const violations = [];
const guardedScreens = new Map([
  ['src/network/LanBattle.tsx', /if \(isCombatTextEntry\(event.target\) \|\| hasCombatModal\(\)\) return/],
  ['src/studio/CaptainSkillsScreen.tsx', /document\.querySelector\('\[role="dialog"\], \[role="alertdialog"\]'\)\) return/],
  ['src/studio/NativeRefit.tsx', /document\.querySelector\('\[role="dialog"\], \[role="alertdialog"\]'\)/],
]);
for (const file of graph.files.filter(file => file.endsWith('.tsx') && file !== 'src/ui/core/UI.tsx')) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imported = new Set();
  for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings))
    for (const element of statement.importClause.namedBindings.elements) if ((element.propertyName?.text ?? element.name.text) === 'Modal') imported.add(element.name.text);
  if (!imported.size) continue;
  let usesModal = false, globalKey = false;
  const visit = node => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && imported.has(node.tagName.getText(source))) usesModal = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'addEventListener'
      && ['window', 'document'].includes(node.expression.expression.getText(source)) && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'keydown') globalKey = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (usesModal && globalKey && /(?:\.key|\.code)\s*===?\s*['"](?:Escape|Tab)['"]/.test(text)) {
    // These full screens own Escape only while no Modal exists. Keep that
    // source guard required; removing it is a regression, not a new exception.
    if (!guardedScreens.get(file)?.test(text)) violations.push(file);
  }
}
assert.deepEqual(violations, [], 'Modal pages must delegate global Escape/Tab ownership to core/UI');
console.log('Shared Modal keyboard ownership contract passed.');
