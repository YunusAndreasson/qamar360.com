/**
 * Babel config. Mirrors Expo's implicit default (`babel-preset-expo`) and adds
 * one local plugin.
 *
 * `stubVariableDynamicImports`: Metro/Hermes can't bundle a dynamic `import()`
 * whose specifier isn't a static string literal — the raw `import(expr)` reaches
 * `hermesc` and fails (which breaks `expo export` / production builds).
 * `@supabase/supabase-js` does exactly this for an OPTIONAL `import()` of
 * `@opentelemetry/api` guarded by `.catch(() => null)`. Rewriting such imports to
 * `Promise.resolve(null)` preserves the intended "OpenTelemetry not installed →
 * no tracing" behavior while letting the bundle compile. Static-string `import()`
 * (Metro code splitting) is left untouched.
 */

/** @param {{ types: import('@babel/types') }} babel */
function stubVariableDynamicImports({ types: t }) {
  return {
    name: 'stub-variable-dynamic-imports',
    visitor: {
      CallExpression(path) {
        const { callee } = path.node;
        if (callee.type !== 'Import') return; // only dynamic import(...)
        const arg = path.node.arguments[0];
        if (arg && arg.type === 'StringLiteral') return; // static — Metro handles it
        path.replaceWith(
          t.callExpression(
            t.memberExpression(t.identifier('Promise'), t.identifier('resolve')),
            [t.nullLiteral()],
          ),
        );
      },
    },
  };
}

module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [stubVariableDynamicImports],
  };
};
