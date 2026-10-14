import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const normalizePath = value => value.replaceAll('\\', '/');
const codePattern = /\.(?:[cm]?js|[cm]?ts|tsx|jsx)$/;
const declarationPattern = /\.d\.[cm]?ts$/;
export function sourceFiles(root, directories = ['src', 'server', 'desktop']) {
  const files = [];
  const walk = directory => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (codePattern.test(file) && !declarationPattern.test(file)) files.push(normalizePath(path.relative(root, file)));
    }
  };
  directories.forEach(directory => walk(path.resolve(root, directory)));
  return files.sort();
}

/** Syntax-aware import graph. Type-only edges are reported but never form runtime cycles. */
export function dependencyGraph(root, directories) {
  const files = sourceFiles(root, directories), fileSet = new Set(files), edges = [], unresolved = [];
  const options = {moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext,
    allowJs: true, allowArbitraryExtensions: true, resolveJsonModule: true};
  const cache = ts.createModuleResolutionCache(root, value => value, options);
  for (const file of files) {
    const absolute = path.resolve(root, file), source = ts.createSourceFile(file, fs.readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
    const add = (node, specifier, kind) => {
      const clean = specifier.replace(/\?.*$/, '');
      if (!clean.startsWith('.')) {
        edges.push({from: file, to: specifier, kind, external: true, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1});
        return;
      }
      let resolved = ts.resolveModuleName(clean, absolute, options, ts.sys, cache).resolvedModule?.resolvedFileName;
      if (resolved && declarationPattern.test(resolved)) {
        const implementation = resolved.replace(/\.d\.mts$/, '.mjs').replace(/\.d\.cts$/, '.cjs').replace(/\.d\.ts$/, '.js');
        if (fs.existsSync(implementation)) resolved = implementation;
      }
      const relative = resolved && normalizePath(path.relative(root, resolved));
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (relative && fileSet.has(relative)) edges.push({from: file, to: relative, kind, external: false, line});
      else if (!resolved && /(?:\.[cm]?[jt]sx?)?$/.test(clean) && !/\.(?:css|json|wasm|png|jpg|webp|svg|woff2?|glsl|frag|vert)$/.test(clean))
        unresolved.push({from: file, specifier, line});
    };
    const visit = node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const onlyTypes = clause?.isTypeOnly || (bindings && ts.isNamedImports(bindings) && !clause.name && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly));
        add(node, node.moduleSpecifier.text, onlyTypes ? 'type' : 'runtime');
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const onlyTypes = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(item => item.isTypeOnly));
        add(node, node.moduleSpecifier.text, onlyTypes ? 'type' : 'runtime');
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        add(node, node.argument.literal.text, 'type');
      } else if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0])
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        add(node, node.arguments[0].text, 'runtime');
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const unique = new Map();
  for (const edge of edges) unique.set(`${edge.from}\0${edge.to}\0${edge.kind}`, edge);
  return {files, edges: [...unique.values()], unresolved};
}

export function runtimeCycles(graph) {
  const adjacency = new Map(graph.files.map(file => [file, []]));
  for (const edge of graph.edges) if (!edge.external && edge.kind === 'runtime') adjacency.get(edge.from).push(edge.to);
  let next = 0;
  const indices = new Map(), lows = new Map(), stack = [], onStack = new Set(), components = [];
  const visit = file => {
    indices.set(file, next); lows.set(file, next++); stack.push(file); onStack.add(file);
    for (const target of adjacency.get(file)) {
      if (!indices.has(target)) { visit(target); lows.set(file, Math.min(lows.get(file), lows.get(target))); }
      else if (onStack.has(target)) lows.set(file, Math.min(lows.get(file), indices.get(target)));
    }
    if (lows.get(file) === indices.get(file)) {
      const component = []; let member;
      do { member = stack.pop(); onStack.delete(member); component.push(member); } while (member !== file);
      if (component.length > 1 || adjacency.get(file).includes(file)) components.push(component.sort());
    }
  };
  graph.files.forEach(file => { if (!indices.has(file)) visit(file); });
  const group = new Map(components.flatMap((component, i) => component.map(file => [file, i])));
  return {components, edges: graph.edges.filter(edge => !edge.external && edge.kind === 'runtime' && group.has(edge.from) && group.get(edge.from) === group.get(edge.to))};
}

export function dependencyViolations(graph) {
  const violations = [];
  const forbid = (edge, rule, reason) => violations.push({...edge, rule, reason});
  for (const edge of graph.edges) {
    const {from, to} = edge;
    const ui = /^(?:src\/(?:ui|studio|network|campaign\/client)|server|desktop)\//;
    if (/^src\/shared\//.test(from) && (/^src\/(?:engine|ui|studio|network|campaign)\//.test(to) || /^(?:server|desktop)\//.test(to)))
      forbid(edge, 'shared-independent', 'Shared data and migration primitives must not depend on a concrete game or host.');
    if (/^src\/engine\/contracts\//.test(from) && !/^src\/(?:engine\/contracts|shared)\//.test(to) && !edge.external)
      forbid(edge, 'public-contract', 'Public wire data must not depend on implementation or host classes.');
    if (/^src\/campaign\/(?:core|rules)\//.test(from) && (ui.test(to) || /^(?:react|react-dom|node:|ws$)/.test(to)))
      forbid(edge, 'campaign-rule', 'Campaign rules must not depend on presentation, transport or persistence hosts.');
    if (/^src\/engine\/math\//.test(from) && !/^src\/engine\/math\//.test(to) && !edge.external)
      forbid(edge, 'math-independent', 'Math primitives must remain independent of game state.');
    if (/^(?:server|desktop)\//.test(from) && /^src\/(?:ui|studio|campaign\/client)\//.test(to))
      forbid(edge, 'host-ui', 'Host code must use data contracts rather than browser presentation modules.');
    if (/^src\/ui\/core\//.test(from) && /^src\/(?:engine\/simulation|studio|network)\//.test(to))
      forbid(edge, 'ui-core-domain', 'Shared controls must not own game or network business logic.');
    if (/^src\//.test(from) && /^(?:node:|fs(?:\/|$)|path$|child_process$|http$|https$|net$|tls$|node:sqlite)/.test(to))
      forbid(edge, 'browser-node', 'Browser and browser Worker sources cannot import Node hosts.');
    if (/^src\/engine\/ai\/batch\/(?:StageProtocol|StageAIData|FireProtocol|AI.*Solver|Fire.*Kernel|FireBudget|ContactKernel)\.ts$/.test(from)
      && /(?:\/simulation\/(?:Ship|Weapon)\.|\/batch\/(?:StageBridge|StageProducer|StageAIProducer|FireInputs)\.)/.test(to))
      forbid(edge, 'numeric-query', 'Numeric query contracts and solvers must not acquire mutable authority bridges.');
  }
  for (const edge of runtimeCycles(graph).edges) forbid(edge, 'runtime-cycle', 'Existing runtime cycle: move data or composition to an explicit boundary before removing this exception.');
  return violations;
}
export const violationKey = edge => `${edge.rule}|${edge.kind}|${edge.from}|${edge.to}`;
