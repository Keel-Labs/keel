// electron-builder afterAllArtifactBuild hook: notarize every macOS DMG
// via a notarytool Keychain profile, then staple the ticket onto the DMG.
// Throws on any non-Accepted status so the build fails loudly instead of
// silently shipping an artifact Apple hasn't signed off on.
//
// Notarizing the DMG is sufficient — Apple's notary service inspects the .app
// inside and the DMG's stapled ticket is what Gatekeeper checks on download.
import { execFileSync } from 'node:child_process';

export default async function notarizeMac(buildResult) {
  if (process.env.SKIP_NOTARIZATION === '1') {
    console.log('notarize-mac: SKIP_NOTARIZATION=1, skipping (verify-dmg.sh will fail the build)');
    return [];
  }

  const dmgs = (buildResult.artifactPaths || []).filter((p) => p.endsWith('.dmg'));
  if (dmgs.length === 0) {
    console.log('notarize-mac: no .dmg artifacts to notarize');
    return [];
  }

  const profile = process.env.NOTARYTOOL_KEYCHAIN_PROFILE || 'keel-notarytool';

  for (const dmg of dmgs) {
    console.log(`notarize-mac: submitting ${dmg} via keychain profile "${profile}" (5–15 min)`);
    const out = execFileSync(
      'xcrun',
      ['notarytool', 'submit', dmg, '--keychain-profile', profile, '--wait'],
      { encoding: 'utf8' },
    );
    process.stdout.write(out);

    const statusLine = out.split('\n').reverse().find((l) => /^\s*status:\s*/i.test(l)) || '';
    const status = statusLine.split(':').pop()?.trim();
    if (status !== 'Accepted') {
      throw new Error(`notarize-mac: notarytool returned status "${status}" for ${dmg} — refusing to ship`);
    }

    console.log(`notarize-mac: stapling ${dmg}`);
    execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
  }

  console.log('notarize-mac: done');
  return [];
}
