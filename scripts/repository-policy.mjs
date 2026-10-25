export function prohibitedRepositoryPath(path) {
  const parts = path.replaceAll('\\', '/').split('/');
  const name = parts.at(-1);
  if (
    parts.some((part) =>
      [
        '.aws',
        '.codex',
        '.agents',
        '.claude',
        '.cursor',
        'node_modules',
        '.scratch',
        'playwright-report',
        'test-results',
        '.aws-sam',
        '.aws-sam-cms',
        'coverage',
        '.local-cms',
      ].includes(part),
    )
  )
    return true;
  if (parts[0] === 'docs' && parts[1] === 'reports') return true;
  if (parts[0] === 'web' && ['dist', '.vite'].includes(parts[1])) return true;
  if (
    /^\.env(?:\.|$)/i.test(name) &&
    !['.env.example', '.env.sample', '.env.template'].includes(name)
  )
    return true;
  return (
    /\.(?:pem|key|p12|pfx|log)$/i.test(name) ||
    /^samconfig\.(?:toml|ya?ml)$/i.test(name)
  );
}
