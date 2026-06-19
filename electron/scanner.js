const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function homePath(...parts) {
  return path.join(os.homedir(), ...parts);
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

function readJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeSnippet(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectParagraph(lines, startIndex = 0) {
  const chunks = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (chunks.length) break;
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      if (chunks.length) break;
      continue;
    }
    chunks.push(line.replace(/^>\s?/, ''));
    if (normalizeSnippet(chunks.join(' ')).length >= 260) break;
  }
  return normalizeSnippet(chunks.join(' ')).slice(0, 260);
}

function collectSectionSnippet(lines, headingPattern) {
  const headingIndex = lines.findIndex((line) => /^#{2,6}\s+/.test(line) && headingPattern.test(line));
  if (headingIndex === -1) return '';

  const chunks = [];
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      if (chunks.length) break;
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) break;
    chunks.push(line.replace(/^>\s?/, ''));
    if (normalizeSnippet(chunks.join(' ')).length >= 260) break;
  }
  return normalizeSnippet(chunks.join(' ')).slice(0, 260);
}

function parseFrontmatter(contents) {
  const lines = String(contents || '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  const result = {};
  let index = 1;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (line === '---') break;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      const [, key, rawValue] = match;
      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        result[key] = rawValue
          .slice(1, -1)
          .split(',')
          .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else {
        result[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
      }
    }
    index += 1;
  }

  return result;
}

function inferSourceTag(meta, filePath) {
  const origin = String(meta.origin || '').trim();
  const author = String(meta.author || '').trim();
  const homepage = String(meta.homepage || '').trim();
  const repo = String(meta.repo || '').trim();
  const pathValue = String(filePath || '');
  const officialPath = /(?:^|[\\/])(?:\.system|openai-bundled|openai-primary-runtime)(?:[\\/]|$)/i.test(pathValue);
  const officialOrigin = /^(official|openai|anthropic)$/i.test(origin);

  if (officialPath || officialOrigin) {
    return { kind: 'official', label: '官方' };
  }

  let githubAuthor = author;
  if (!githubAuthor) {
    const githubUrl = [homepage, repo].find((value) => /github\.com/i.test(value));
    const ownerMatch = githubUrl?.match(/github\.com\/([^/]+)\//i);
    if (ownerMatch?.[1]) {
      githubAuthor = ownerMatch[1];
    }
  }

  if (githubAuthor) {
    return { kind: 'github', label: githubAuthor, source: 'GitHub' };
  }

  return { kind: 'local', label: '本地' };
}

async function listFiles(root, predicate, acc = []) {
  if (!(await pathExists(root))) return acc;
  const entries = await fsp.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await listFiles(fullPath, predicate, acc);
    } else if (!predicate || predicate(fullPath)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function parseSkillMarkdown(filePath, contents) {
  const frontmatter = parseFrontmatter(contents);
  const lines = contents.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line.startsWith('# '));
  const titleLine = titleIndex >= 0 ? lines[titleIndex] : '';
  const title = titleLine.replace(/^#\s+/, '').trim() || path.basename(path.dirname(filePath));
  const descriptionIndex =
    lines.findIndex((line, index) => index > titleIndex && line.startsWith('> ')) ||
    lines.findIndex((line, index) => index > titleIndex && line.trim().length > 0 && !line.startsWith('#'));
  const descriptionLine = descriptionIndex >= 0 ? lines[descriptionIndex] : '';
  const introStart = descriptionIndex >= 0 ? descriptionIndex + 1 : Math.max(titleIndex + 1, 0);
  const summary =
    collectParagraph(lines, introStart) ||
    descriptionLine.replace(/^>\s+/, '').trim().slice(0, 200);
  const usage =
    collectSectionSnippet(lines, /when to use|use when|usage|how to use|trigger|适用场景|用法|使用|何时使用/i) ||
    collectSectionSnippet(lines, /examples|例子|示例/i);
  const sourceTag = inferSourceTag(frontmatter, filePath);
  return {
    name: path.basename(path.dirname(filePath)),
    title,
    description: descriptionLine.replace(/^>\s+/, '').trim().slice(0, 200),
    summary,
    usage,
    author: frontmatter.author || '',
    origin: frontmatter.origin || '',
    homepage: frontmatter.homepage || '',
    repo: frontmatter.repo || '',
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    sourceTag,
    filePath,
  };
}

async function scanSkillDirectory(agentId, rootDir) {
  const results = [];
  if (!(await pathExists(rootDir))) return results;
  const files = await listFiles(rootDir, (file) => path.basename(file).toLowerCase() === 'skill.md');
  for (const filePath of files) {
    const contents = await fsp.readFile(filePath, 'utf8');
    const folderPath = path.dirname(filePath);
    const sourceRoot = path.relative(os.homedir(), rootDir) || rootDir;
    results.push({
      agentId,
      folderPath,
      relativeFolder: path.relative(rootDir, folderPath) || '.',
      relativePath: path.relative(rootDir, filePath),
      sourceRoot,
      ...parseSkillMarkdown(filePath, contents),
    });
  }
  return results;
}

function flattenStrings(value, acc = []) {
  if (typeof value === 'string') {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenStrings(item, acc);
    return acc;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) flattenStrings(item, acc);
  }
  return acc;
}

function parseClaudeSkillListing(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => {
      const body = line.slice(2);
      const colonIndex = body.indexOf(':');
      if (colonIndex === -1) {
        return { name: body.trim(), description: '' };
      }
      return {
        name: body.slice(0, colonIndex).trim(),
        description: body.slice(colonIndex + 1).trim(),
      };
    })
    .filter((item) => item.name);
}

async function scanClaude() {
  const root = homePath('.claude');
  const projectFiles = await listFiles(path.join(root, 'projects'), (file) => file.endsWith('.jsonl'));
  const sessionMap = new Map();
  const confirmedSkills = [];
  const evidence = [];

  for (const filePath of projectFiles) {
    const sessionId = path.basename(filePath, '.jsonl');
    const text = await fsp.readFile(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      const item = readJsonSafe(line);
      if (!item) continue;
      const derivedSessionId = item.sessionId || item?.message?.id || sessionId;
      const current = sessionMap.get(derivedSessionId) || {
        id: derivedSessionId,
        agentId: 'claude',
        sourcePath: filePath,
        title: item.cwd ? path.basename(item.cwd) : 'Claude session',
        updatedAt: item.timestamp || item?.message?.timestamp || null,
        eventCount: 0,
        toolNames: new Set(),
        skills: new Set(),
        evidence: [],
      };

      current.eventCount += 1;
      if (item.timestamp) current.updatedAt = item.timestamp;
      if (item.cwd) current.cwd = item.cwd;
      if (item.version) current.version = item.version;

      if (item.attachment?.type === 'skill_listing') {
        const skillItems = parseClaudeSkillListing(item.attachment.content || '');
        for (const skill of skillItems) {
          current.skills.add(skill.name);
          confirmedSkills.push({
            agentId: 'claude',
            name: skill.name,
            description: skill.description,
            status: 'confirmed',
            source: filePath,
            evidence: 'skill_listing',
            sessionId: derivedSessionId,
            updatedAt: item.timestamp || null,
          });
        }
        current.evidence.push('skill_listing');
      }

      const contentItems = Array.isArray(item.message?.content) ? item.message.content : [];
      for (const contentItem of contentItems) {
        if (contentItem?.type === 'tool_use' && contentItem.name) {
          current.toolNames.add(contentItem.name);
        }
      }

      const rawStrings = flattenStrings(item);
      if (rawStrings.some((value) => /skill/i.test(value))) {
        current.evidence.push('skill-reference');
      }

      sessionMap.set(derivedSessionId, current);
    }
  }

  const localSkills = await scanSkillDirectory('claude', path.join(root, 'skills'));

  return {
    agentId: 'claude',
    root,
    sessions: [...sessionMap.values()].map((session) => ({
      ...session,
      toolNames: [...session.toolNames],
      skills: [...session.skills],
      evidence: [...new Set(session.evidence)],
    })),
    skills: localSkills,
    confirmedSkills,
    inferredSkills: [],
    notes: projectFiles.length
      ? `扫描到 ${projectFiles.length} 个项目会话文件`
      : '没有找到 Claude 项目会话',
    available: localSkills.length,
  };
}

async function scanCodex() {
  const root = homePath('.codex');
  const sessionIndexPath = path.join(root, 'session_index.jsonl');
  const historyPath = path.join(root, 'history.jsonl');
  const archivedSessionsDir = path.join(root, 'archived_sessions');
  const sessions = [];
  const confirmedSkills = [];
  const inferredSkills = [];
  const evidence = [];

  if (await pathExists(sessionIndexPath)) {
    const lines = (await fsp.readFile(sessionIndexPath, 'utf8')).split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const item = readJsonSafe(line);
      if (!item) continue;
      const sessionName = item.thread_name || item.id;
      sessions.push({
        id: item.id,
        agentId: 'codex',
        title: sessionName,
        updatedAt: item.updated_at ? new Date(item.updated_at).toISOString() : null,
        sourcePath: sessionIndexPath,
        eventCount: 1,
        toolNames: [],
        skills: /skill/i.test(sessionName) ? [sessionName] : [],
        evidence: /skill/i.test(sessionName) ? ['thread_name'] : [],
      });
      if (/skill/i.test(sessionName)) {
        inferredSkills.push({
          agentId: 'codex',
          name: sessionName,
          status: 'inferred',
          source: sessionIndexPath,
          evidence: 'thread_name',
          sessionId: item.id,
          updatedAt: item.updated_at ? new Date(item.updated_at).toISOString() : null,
        });
      }
    }
  }

  if (await pathExists(historyPath)) {
    const lines = (await fsp.readFile(historyPath, 'utf8')).split(/\r?\n/).filter(Boolean);
    for (const line of lines.slice(-200)) {
      if (!/skill/i.test(line)) continue;
      evidence.push({
        source: historyPath,
        snippet: line.slice(0, 240),
      });
    }
  }

  if (await pathExists(archivedSessionsDir)) {
    const archivedFiles = await listFiles(archivedSessionsDir, (file) => file.endsWith('.jsonl'));
    for (const filePath of archivedFiles) {
      const lines = (await fsp.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        if (!/skill/i.test(line)) continue;
        evidence.push({
          source: filePath,
          snippet: line.slice(0, 240),
        });
      }
    }
  }

  const localSkills = await scanSkillDirectory('codex', path.join(root, 'skills'));
  const vendorSkills = await scanSkillDirectory('codex', path.join(root, 'vendor_imports', 'skills'));

  return {
    agentId: 'codex',
    root,
    sessions,
    skills: [...localSkills, ...vendorSkills],
    confirmedSkills,
    inferredSkills,
    evidence,
    notes: sessions.length
      ? `读取到 ${sessions.length} 条 Codex 会话索引`
      : '没有找到 Codex 会话索引',
    available: localSkills.length + vendorSkills.length,
  };
}

async function scanHermes() {
  const root = homePath('.hermes');
  const logsDir = path.join(root, 'logs');
  const sessionsDb = path.join(root, 'state.db');
  const sessions = [];
  const confirmedSkills = [];
  const inferredSkills = [];
  const evidence = [];

  if (await pathExists(sessionsDb)) {
    try {
      const raw = execFileSync('sqlite3', ['-json', sessionsDb, 'select id, source, model, started_at, ended_at, message_count, tool_call_count, cwd, title from sessions order by started_at desc limit 100;'], {
        encoding: 'utf8',
      }).trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const row of parsed) {
          sessions.push({
            id: row.id,
            agentId: 'hermes',
            title: row.title || row.model || row.source || 'Hermes session',
            updatedAt: row.ended_at ? new Date(row.ended_at * 1000).toISOString() : row.started_at ? new Date(row.started_at * 1000).toISOString() : null,
            sourcePath: sessionsDb,
            eventCount: row.message_count || 0,
            toolNames: [],
            skills: [],
            evidence: [],
            cwd: row.cwd || '',
          });
        }
      }
    } catch (error) {
      evidence.push({
        source: sessionsDb,
        snippet: `sqlite3 query failed: ${error.message}`,
      });
    }
  }

  if (await pathExists(logsDir)) {
    const logFiles = await listFiles(logsDir, (file) => file.endsWith('.log'));
    for (const filePath of logFiles) {
      const lines = (await fsp.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean);
      for (const line of lines.slice(-500)) {
        if (!/skill/i.test(line)) continue;
        evidence.push({
          source: filePath,
          snippet: line.slice(0, 240),
        });
        if (/skills synced/i.test(line) || /prepare config and skills/i.test(line)) {
          inferredSkills.push({
            agentId: 'hermes',
            name: 'skills-sync',
            status: 'available',
            source: filePath,
            evidence: line.slice(0, 240),
            sessionId: null,
            updatedAt: null,
          });
        }
      }
    }
  }

  const localSkills = [
    ...(await scanSkillDirectory('hermes', path.join(root, 'skills'))),
    ...(await scanSkillDirectory('hermes', path.join(root, 'hermes-agent', 'skills'))),
  ];

  return {
    agentId: 'hermes',
    root,
    sessions,
    skills: localSkills,
    confirmedSkills,
    inferredSkills,
    evidence,
    notes: localSkills.length
      ? `扫描到 ${localSkills.length} 个 Hermes skill 文件`
      : '没有找到 Hermes skill 文件',
    available: localSkills.length,
  };
}

async function scanWorkspace() {
  const [claude, codex, hermes] = await Promise.all([scanClaude(), scanCodex(), scanHermes()]);
  const allSkills = [
    ...claude.confirmedSkills,
    ...codex.confirmedSkills,
    ...codex.inferredSkills,
    ...hermes.confirmedSkills,
    ...hermes.inferredSkills,
    ...claude.skills.map((item) => ({
      agentId: item.agentId,
      name: item.title,
      status: 'available',
      source: item.filePath,
      evidence: 'skill file',
      sessionId: null,
      updatedAt: null,
      description: item.description,
    })),
    ...codex.skills.map((item) => ({
      agentId: item.agentId,
      name: item.title,
      status: 'available',
      source: item.filePath,
      evidence: 'skill file',
      sessionId: null,
      updatedAt: null,
      description: item.description,
    })),
    ...hermes.skills.map((item) => ({
      agentId: item.agentId,
      name: item.title,
      status: 'available',
      source: item.filePath,
      evidence: 'skill file',
      sessionId: null,
      updatedAt: null,
      description: item.description,
    })),
  ];

  const uniqueSkills = [];
  const seen = new Set();
  for (const skill of allSkills) {
    const key = `${skill.agentId}:${skill.name}:${skill.status}:${skill.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueSkills.push(skill);
  }

  return {
    scannedAt: new Date().toISOString(),
    agents: [claude, codex, hermes],
    skills: uniqueSkills,
  };
}

module.exports = {
  scanWorkspace,
  homePath,
};
