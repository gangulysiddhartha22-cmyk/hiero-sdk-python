/**
 * Dependabot Changelog Entry Adder
 *
 * Inserts a Dependabot update entry as the first bullet under
 * ### .github or ### Src in CHANGELOG.md.
 *
 * Usage:
 *   node .github/scripts/add-dependabot-changelog.js <dryRun> <entry> <prNumber> <subsection>
 */
const fs = require('fs');
const path = require('path');

const [dryRunStr, entry, prNumber, subsection] = process.argv.slice(2);
const ALLOWED_SUBSECTIONS = new Set(['.github', 'Src']);

if (!dryRunStr || !entry || !prNumber || !subsection) {
    console.error('Usage: node add-dependabot-changelog.js <dryRun> <entry> <prNumber> <subsection>');
    process.exit(1);
}

const dryRun = dryRunStr === 'true';
if (!ALLOWED_SUBSECTIONS.has(subsection)) {
    console.error(`Invalid subsection: ${subsection}`);
    process.exit(1);
}
const CHANGELOG_PATH = path.join(process.cwd(), 'CHANGELOG.md');

const safeEntry = entry.replace(/[\r\n]+/g, ' ').trim();
const safePrNumber = String(prNumber).trim();
if (!/^\d+$/.test(safePrNumber) && safePrNumber !== 'dry-run') {
    console.error(`Invalid prNumber: ${safePrNumber}`);
    process.exit(1);
}

if (!fs.existsSync(CHANGELOG_PATH)) {
    console.log('CHANGELOG.md not found — skipping');
    process.exit(0);
}

const bullet = safeEntry.includes(`(#${safePrNumber})`)
    ? `- ${safeEntry}`
    : `- ${safeEntry} (#${safePrNumber})`;

if (dryRun) {
    console.log(`[DRY-RUN] Would insert under ## [Unreleased] > ### ${subsection}:`);
    console.log(`  ${bullet}`);
    console.log('[DRY-RUN] No file changes made.');
    process.exit(0);
}

const lines = fs.readFileSync(CHANGELOG_PATH, 'utf8').split('\n');
let unreleasedStart = -1;
let unreleasedEnd = lines.length;
let foundHeadingIndex = -1;
let firstBulletIndex = -1;

for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (unreleasedStart === -1 && /^##\s*\[?Unreleased\]?\s*$/i.test(trimmed)) {
        unreleasedStart = i;
        continue;
    }
    if (unreleasedStart !== -1 && /^##\s+/.test(trimmed)) {
        unreleasedEnd = i;
        break;
    }
}
if (unreleasedStart === -1) {
    console.log('Could not find [Unreleased] section — skipping insert');
    process.exit(0);
}
for (let i = unreleasedStart + 1; i < unreleasedEnd; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === `### ${subsection}`) {
        foundHeadingIndex = i;
        for (let j = i + 1; j < unreleasedEnd; j++) {
            const t = lines[j].trim();
            if (t.startsWith('-') || t.startsWith('*')) { firstBulletIndex = j; break; }
            if (t.startsWith('### ') || t.startsWith('## ')) break;
        }
        break;
    }
}

const insertAt = foundHeadingIndex !== -1
    ? (firstBulletIndex !== -1 ? firstBulletIndex : foundHeadingIndex + 1)
    : -1;
if (lines.some((l) => l.trim() === bullet.trim())) {
    console.log('Entry already present — skipping insert');
    process.exit(0);
}

if (insertAt !== -1) {
    lines.splice(insertAt, 0, bullet);
} else {
    lines.splice(unreleasedEnd, 0, '', `### ${subsection}`, bullet, '');
}

try {
    fs.writeFileSync(CHANGELOG_PATH, lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n');
    console.log(`Inserted: "${bullet}" under ### ${subsection}`);
} catch (err) {
    console.error(`Failed to write CHANGELOG.md: ${err.message}`);
    process.exit(1);
}
