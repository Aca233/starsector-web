import ts from 'typescript';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'src/network/ComponentMutation.mjs');
const mutators = new Set([
  'set', 'add', 'delete', 'clear', 'push', 'pop', 'shift', 'unshift', 'splice',
  'sort', 'reverse', 'fill', 'copyWithin',
  'setTime', 'setMilliseconds', 'setUTCMilliseconds', 'setSeconds', 'setUTCSeconds',
  'setMinutes', 'setUTCMinutes', 'setHours', 'setUTCHours', 'setDate', 'setUTCDate',
  'setMonth', 'setUTCMonth', 'setFullYear', 'setUTCFullYear', 'setYear',
  'setInt8', 'setUint8', 'setInt16', 'setUint16', 'setInt32', 'setUint32',
  'setFloat32', 'setFloat64', 'setBigInt64', 'setBigUint64',
]);
const objectMutators = new Set([
  'assign', 'defineProperty', 'defineProperties', 'setPrototypeOf',
  'preventExtensions', 'seal', 'freeze',
]);
const reflectMutators = new Set([
  'defineProperty', 'set', 'deleteProperty', 'setPrototypeOf', 'preventExtensions',
]);

function eligible(file) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  return /\.[cm]?tsx?$/.test(file) && !/\.d\.[cm]?ts$/.test(file)
    && /^(?:src\/(?:engine|network|ui)\/|scripts\/.*\.mts$)/.test(relative)
    && !/(?:MutationJournal|ComponentReplication|ComponentMutation|ComponentWireMetadata)\./.test(relative);
}

function transparent(node) {
  return ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)
    || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node);
}

function unwrap(node) {
  while (transparent(node)) node = node.expression;
  return node;
}

function memberName(node) {
  if (ts.isPropertyAccessExpression(node) && !ts.isPrivateIdentifier(node.name)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const key = unwrap(node.argumentExpression);
    if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) return key.text;
  }
  return undefined;
}

/**
 * Wrap receivers, not writes: the original JS operator keeps its reference, this,
 * return value, evaluation order and short-circuiting. Marks may conservatively
 * precede a failed/no-op write. This is syntactic instrumentation, not a JS membrane:
 * aliases/dynamic method names, spread-hidden Object/Reflect targets, and receivers
 * inside a continuous optional chain are deliberately not guessed or re-evaluated.
 */
export function transformComponentWrites(code, file) {
  if (!eligible(file)) return null;
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true,
    file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // Include nested bindings: a fixed import alias can be shadowed at a write site.
  const names = new Set();
  const collect = node => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const fresh = base => {
    let name = base;
    for (let i = 1; names.has(name); i++) name = `${base}_${i}`;
    names.add(name);
    return name;
  };
  const markName = fresh('__replicationWrite');
  const enableName = fresh('__enableComponentMutations');
  let changed = false;
  const result = ts.transform(source, [context => {
    const f = context.factory;
    const call = (value, key) => {
      changed = true;
      return f.createCallExpression(f.createIdentifier(markName), undefined,
        key === undefined ? [value] : [value, f.createStringLiteral(key)]);
    };
    const updateWrapper = (node, expression) => {
      if (ts.isParenthesizedExpression(node)) return f.updateParenthesizedExpression(node, expression);
      if (ts.isNonNullExpression(node)) return f.updateNonNullExpression(node, expression);
      if (ts.isAsExpression(node)) return f.updateAsExpression(node, expression, node.type);
      if (ts.isTypeAssertionExpression(node)) return f.updateTypeAssertion(node, node.type, expression);
      return f.updateSatisfiesExpression(node, expression, node.type);
    };
    // Receives already-visited children; never visit a generated hook a second time.
    const receiver = (node, structural) => {
      if (transparent(node)) return updateWrapper(node, receiver(node.expression, structural));
      if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return node;
      // mark(obj?.child).push() would destroy the original chain's short circuit.
      // Adding ?. instead would incorrectly swallow a genuinely null child.
      if (ts.isOptionalChain(node) && ts.isOptionalChain(node.expression)) return node;
      const key = !structural && ts.isPropertyAccessExpression(node)
        && !ts.isPrivateIdentifier(node.name) ? node.name.text : undefined;
      if (node.expression.kind === ts.SyntaxKind.SuperKeyword) {
        // Keep the super Reference (including its actual this receiver) intact.
        const argument = ts.isPropertyAccessExpression(node)
          ? f.createStringLiteral(node.name.text) : node.argumentExpression;
        return f.createElementAccessExpression(node.expression,
          f.createParenthesizedExpression(f.createCommaListExpression([call(f.createThis(), key), argument])));
      }
      const base = call(node.expression, key);
      if (ts.isPropertyAccessExpression(node)) {
        return ts.isOptionalChain(node)
          ? f.updatePropertyAccessChain(node, base, node.questionDotToken, node.name)
          : f.updatePropertyAccessExpression(node, base, node.name);
      }
      return ts.isOptionalChain(node)
        ? f.updateElementAccessChain(node, base, node.questionDotToken, node.argumentExpression)
        : f.updateElementAccessExpression(node, base, node.argumentExpression);
    };
    const target = (node, structural = false) => {
      if (transparent(node)) return updateWrapper(node, target(node.expression, structural));
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        return receiver(ts.visitEachChild(node, visit, context), structural);
      }
      if (ts.isArrayLiteralExpression(node)) {
        return f.updateArrayLiteralExpression(node, node.elements.map(n => target(n, structural)));
      }
      if (ts.isObjectLiteralExpression(node)) {
        return f.updateObjectLiteralExpression(node, node.properties.map(n => {
          if (ts.isPropertyAssignment(n)) {
            return f.updatePropertyAssignment(n, ts.visitNode(n.name, visit), target(n.initializer, structural));
          }
          if (ts.isSpreadAssignment(n)) return f.updateSpreadAssignment(n, target(n.expression, structural));
          return ts.visitEachChild(n, visit, context);
        }));
      }
      if (ts.isSpreadElement(node)) return f.updateSpreadElement(node, target(node.expression, structural));
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        return f.updateBinaryExpression(node, target(node.left, structural), node.operatorToken, ts.visitNode(node.right, visit));
      }
      return ts.visitEachChild(node, visit, context);
    };
    const visit = node => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        return f.updateBinaryExpression(node, target(node.left), node.operatorToken, ts.visitNode(node.right, visit));
      }
      if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
        return ts.isPrefixUnaryExpression(node) ? f.updatePrefixUnaryExpression(node, target(node.operand))
          : f.updatePostfixUnaryExpression(node, target(node.operand));
      }
      if (ts.isDeleteExpression(node)) return f.updateDeleteExpression(node, target(node.expression, true));
      if (ts.isForOfStatement(node)) {
        return f.updateForOfStatement(node, node.awaitModifier, target(node.initializer),
          ts.visitNode(node.expression, visit), ts.visitNode(node.statement, visit));
      }
      if (ts.isForInStatement(node)) {
        return f.updateForInStatement(node, target(node.initializer),
          ts.visitNode(node.expression, visit), ts.visitNode(node.statement, visit));
      }
      node = ts.visitEachChild(node, visit, context);
      if (!ts.isCallExpression(node)) return node;
      const callee = unwrap(node.expression);
      const name = memberName(callee);
      if (name === undefined) return node;
      const owner = unwrap(callee.expression);
      const builtin = ts.isIdentifier(owner)
        && ((owner.text === 'Object' && objectMutators.has(name))
          || (owner.text === 'Reflect' && reflectMutators.has(name)));
      if (builtin) {
        // Never turn ...args into mark(...args), or spread it twice via a new array.
        // Only explicit arguments before the first spread have a known position.
        let spread = false;
        const args = node.arguments.map((argument, index) => {
          spread ||= ts.isSpreadElement(argument);
          return !spread && (index === 0 || (owner.text === 'Reflect' && name === 'set' && index === 3))
            ? call(argument) : argument;
        });
        return f.updateCallExpression(node, node.expression, node.typeArguments, args);
      }
      if (mutators.has(name)) {
        return f.updateCallExpression(node, receiver(node.expression, true), node.typeArguments, node.arguments);
      }
      // Borrowed known methods still mutate their explicit thisArg, not the prototype.
      if ((name === 'call' || name === 'apply') && mutators.has(memberName(owner))
        && node.arguments.length && !ts.isSpreadElement(node.arguments[0])) {
        return f.updateCallExpression(node, node.expression, node.typeArguments,
          [call(node.arguments[0]), ...node.arguments.slice(1)]);
      }
      return node;
    };
    return node => ts.visitNode(node, visit);
  }]);
  try {
    if (!changed) return null;
    let relative = path.relative(path.dirname(file), runtime).replaceAll('\\', '/');
    if (!relative.startsWith('.')) relative = './' + relative;
    const f = ts.factory;
    const imports = f.createImportDeclaration(undefined, f.createImportClause(false, undefined,
      f.createNamedImports([
        f.createImportSpecifier(false, f.createIdentifier('markComponentWrite'), f.createIdentifier(markName)),
        f.createImportSpecifier(false, f.createIdentifier('enableComponentMutations'), f.createIdentifier(enableName)),
      ])), f.createStringLiteral(relative));
    const enable = f.createExpressionStatement(f.createCallExpression(f.createIdentifier(enableName), undefined, []));
    const transformed = result.transformed[0];
    const statements = [...transformed.statements];
    // Keep directive prologues (and the SourceFile's hashbang) in their original role.
    let index = 0;
    while (index < statements.length && ts.isExpressionStatement(statements[index])
      && ts.isStringLiteral(statements[index].expression)) index++;
    statements.splice(index, 0, imports, enable);
    return ts.createPrinter().printFile(f.updateSourceFile(transformed, statements));
  } finally {
    result.dispose();
  }
}

export function componentWriteVitePlugin() {
  return {
    name: 'component-write-journal', enforce: 'pre',
    transform(code, id) {
      const result = transformComponentWrites(code, id.split('?')[0]);
      return result === null ? null : {code: result, map: null};
    },
  };
}

export function componentWriteEsbuildPlugin() {
  return {
    name: 'component-write-journal',
    setup(build) {
      build.onLoad({filter: /\.[cm]?tsx?$/}, async args => {
        if (!eligible(args.path)) return null;
        const code = await fs.readFile(args.path, 'utf8');
        const result = transformComponentWrites(code, args.path);
        return result === null ? null : {
          contents: result, loader: args.path.endsWith('tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path),
        };
      });
    },
  };
}
