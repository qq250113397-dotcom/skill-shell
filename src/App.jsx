import React, { useEffect, useMemo, useState, useTransition } from 'react';

const AGENT_META = {
  claude: {
    label: 'Claude Code',
    accent: '#7c8cff',
    glow: 'rgba(124, 140, 255, 0.35)',
    description: '从 `.claude` 项目日志和技能目录里提取可确认的 skill 证据。',
  },
  codex: {
    label: 'Codex',
    accent: '#ff8b5c',
    glow: 'rgba(255, 139, 92, 0.35)',
    description: '从 `session_index`、归档会话和历史文本里找 skill 线索。',
  },
  hermes: {
    label: 'Hermes',
    accent: '#4dd4ac',
    glow: 'rgba(77, 212, 172, 0.35)',
    description: '从 Hermes 日志、SQLite 会话和同步目录里抓技能痕迹。',
  },
};

const TEXT = {
  zh: {
    title: '把 Codex、Claude Code 和 Hermes 的 skill 痕迹放到一块看',
    subtitle: '这个桌面壳会扫描本机的 `.claude`、`.codex`、`.hermes`，把可确认的 skill、推断的 skill 线索，以及技能目录统一成一张审计面板。',
    refresh: '重新扫描',
    scanning: '扫描中...',
    liveTranslate: '实时翻译',
    liveTranslateHint: '按快捷键 `⌘/Ctrl + Shift + T` 开关悬浮翻译窗。',
    chooseRegion: '框选区域',
    chooseRegionHint: '按 `⌘/Ctrl + Shift + R` 重新框选要翻译的屏幕区域。',
    clearRegion: '清除区域',
    regionReady: '已选区域',
    translateOnce: '翻译一次',
    translateOnceHint: '只翻当前选区，不持续刷新。',
    lastScan: '最近扫描',
    confirmed: '确认 skill',
    inferred: '推断 skill',
    available: '可用 skill 文件',
    roots: '数据根',
    confirmedDesc: '来自明确的 skill 事件或列表。',
    inferredDesc: '来自会话标题或历史文本中的 skill 线索。',
    availableDesc: '来自本机技能目录的 markdown 文件。',
    rootsDesc: 'Claude / Codex / Hermes 三个源头一起扫描。',
    step1Title: '先选左边的 agent',
    step1Desc: 'Claude / Codex / Hermes 三种来源各自独立管理。',
    step2Title: '点中间的 skill',
    step2Desc: '右侧会显示它的来源文件、证据和最近会话。',
    step3Title: '用右侧按钮去改文件',
    step3Desc: '直接打开 skill 文件夹，新增、删除或编辑 skill。',
    agentOverview: 'Agent 概览',
    agentOverviewDesc: '点击切换不同 agent 的技能视图。',
    skillsTitle: (name) => `${name} skills`,
    skillsDesc: {
      claude: '从 `.claude` 项目日志和技能目录里提取可确认的 skill 证据。',
      codex: '从 `session_index`、归档会话和历史文本里找 skill 线索。',
      hermes: '从 Hermes 日志、SQLite 会话和同步目录里抓技能痕迹。',
    },
    noSkills: '这个 agent 目前没有可展示的 skill 记录。',
    sessionEvidence: '会话证据',
    sessionEvidenceDesc: '这里会尽量显示能直接证明 skill 使用的文本片段。',
    skillBrief: '功能说明',
    skillBriefDesc: '从 `SKILL.md` 里提炼出来的简短说明。',
    skillUsage: '适用场景',
    skillUsageHint: '如果这里是空的，说明这个 skill 还没写专门的“用法/When to use”段落。',
    editSkill: '编辑',
    openDir: '打开目录',
    openSource: '打开来源',
    copyName: '复制 skill 名称',
    currentSkill: '当前 skill',
    unselected: '未选择',
    selectHint: '先选一个 skill 看证据。',
    currentSession: '关联会话',
    noSession: '无',
    noSessionHint: '当前 agent 没有会话或没有读取到会话索引。',
    evidenceSnippet: '证据片段',
    noneEvidence: '暂无可展示片段。',
    manageHint: '管理提示',
    manageHintText: '你可以先打开 skill 目录，找到对应的 SKILL.md，直接编辑内容；也可以点“编辑”直接改正文。',
    noSummary: '暂无简介',
    sessionList: '最近会话',
    sessionListDesc: '用于快速定位每个 agent 的最近活动和 trace。',
    sessionColumns: ['标题', '更新时间', '事件数', '证据'],
    noSessions: '没有找到会话数据。',
    rootSection: 'Skill 管理入口',
    rootSectionDesc: '这些是你最常用的本地目录。点一下就能直接去改 skill。',
    openRootDir: '打开目录',
    copyPath: '复制路径',
    createSkill: '新建 skill',
    renameSkill: '重命名',
    deleteSkill: '删除',
    searchPlaceholder: '搜索 skill、说明、来源...',
    favoritesOnly: '只看收藏',
    favorites: '收藏',
    selectingAgentFirst: '请先选择一个 agent。',
    copied: '已复制',
    copiedPath: '路径已复制',
    copiedSkill: 'skill 名称已复制',
    opened: '已打开',
    openFailed: '打开失败',
    language: '语言',
    chinese: '中文',
    english: 'English',
    howToOpen: '在哪里打开',
    howToOpenDesc: '你可以直接双击 `release/mac-arm64/Skill Shell.app` 打开；如果想继续改代码，就在终端执行 `cd /Users/chengwei/agent-skill-shell && npm run dev`。',
    howToOpenHint: '开发版和正式版都在这个项目目录里。',
    promptSection: '复现提示词',
    promptSectionDesc: '输入一句目标，自动拼出可以直接给 Codex / Claude Code / Hermes 的复现提示词。',
    promptSeedLabel: '目标一句话',
    promptSeedPlaceholder: '例如：把这个项目做成可以管理 skill 的 Electron 桌面壳，并生成防跑偏 skill。',
    promptPreview: '提示词预览',
    promptCopy: '复制提示词',
    promptReset: '恢复默认',
    promptGuard: '防跑偏规则',
    promptGuardOne: '只做和 skill 管理、复现提示词、Codex 防跑偏相关的改动。',
    promptGuardTwo: '保留中文界面，只有 Codex / Claude Code / Hermes / skill 名称保持英文。',
    promptGuardThree: '改完先自检，再告诉我哪些文件变了、怎么打开、还剩什么没做。',
  },
  en: {
    title: 'See the skill traces for Codex, Claude Code, and Hermes in one place',
    subtitle: 'This desktop shell scans local `.claude`, `.codex`, and `.hermes` data to surface confirmed skills, inferred skill clues, and skill directories in one audit view.',
    refresh: 'Rescan',
    scanning: 'Scanning...',
    liveTranslate: 'Live translate',
    liveTranslateHint: 'Press `Cmd/Ctrl + Shift + T` to toggle the floating translation window.',
    chooseRegion: 'Select region',
    chooseRegionHint: 'Press `Cmd/Ctrl + Shift + R` to reselect the screen area to translate.',
    clearRegion: 'Clear region',
    regionReady: 'Region selected',
    translateOnce: 'Translate once',
    translateOnceHint: 'Only translate the current selection, no continuous refresh.',
    lastScan: 'Last scan',
    confirmed: 'Confirmed skills',
    inferred: 'Inferred skills',
    available: 'Skill files',
    roots: 'Data roots',
    confirmedDesc: 'Comes from explicit skill events or listings.',
    inferredDesc: 'Comes from session titles or historical text clues.',
    availableDesc: 'Comes from markdown skill files in local directories.',
    rootsDesc: 'Scans Claude / Codex / Hermes together.',
    step1Title: 'Pick an agent on the left',
    step1Desc: 'Claude / Codex / Hermes are managed separately.',
    step2Title: 'Pick a skill in the middle',
    step2Desc: 'The right side shows its source file, evidence, and latest session.',
    step3Title: 'Use the right-side actions',
    step3Desc: 'Open the skill folder and edit, add, or remove skills directly.',
    agentOverview: 'Agent overview',
    agentOverviewDesc: 'Click to switch between agent skill views.',
    skillsTitle: (name) => `${name} skills`,
    skillsDesc: {
      claude: 'Confirmed skill evidence extracted from `.claude` project logs and skill directories.',
      codex: 'Skill clues from `session_index`, archived sessions, and historical text.',
      hermes: 'Skill traces from Hermes logs, SQLite sessions, and synced skill directories.',
    },
    noSkills: 'This agent currently has no skill records to show.',
    sessionEvidence: 'Session evidence',
    sessionEvidenceDesc: 'This area shows text snippets that can directly prove skill usage.',
    skillBrief: 'Skill brief',
    skillBriefDesc: 'A short summary extracted from `SKILL.md`.',
    skillUsage: 'Usage',
    skillUsageHint: 'If this is blank, the skill has not added a dedicated “When to use” or usage section yet.',
    editSkill: 'Edit',
    openDir: 'Open folder',
    openSource: 'Open source',
    copyName: 'Copy skill name',
    currentSkill: 'Current skill',
    unselected: 'None selected',
    selectHint: 'Pick a skill first to inspect evidence.',
    currentSession: 'Linked session',
    noSession: 'None',
    noSessionHint: 'No session data or no readable session index for this agent.',
    evidenceSnippet: 'Evidence snippet',
    noneEvidence: 'No snippet available yet.',
    manageHint: 'Management tip',
    manageHintText: 'Open the skill directory, find the matching `SKILL.md`, and edit it directly, or click “Edit” to change the content inline.',
    noSummary: 'No summary yet',
    sessionList: 'Recent sessions',
    sessionListDesc: 'Use this to quickly find recent activity and traces for each agent.',
    sessionColumns: ['Title', 'Updated', 'Events', 'Evidence'],
    noSessions: 'No session data found.',
    rootSection: 'Skill management entry',
    rootSectionDesc: 'These are your most used local folders. Click one to edit skills immediately.',
    openRootDir: 'Open folder',
    copyPath: 'Copy path',
    createSkill: 'New skill',
    renameSkill: 'Rename',
    deleteSkill: 'Delete',
    searchPlaceholder: 'Search skills, notes, or source...',
    favoritesOnly: 'Favorites only',
    favorites: 'Favorites',
    selectingAgentFirst: 'Select an agent first.',
    copied: 'Copied',
    copiedPath: 'Path copied',
    copiedSkill: 'Skill name copied',
    opened: 'Opened',
    openFailed: 'Open failed',
    language: 'Language',
    chinese: '中文',
    english: 'English',
    howToOpen: 'Where to open',
    howToOpenDesc: 'Double-click `release/mac-arm64/Skill Shell.app` to open it, or run `cd /Users/chengwei/agent-skill-shell && npm run dev` in Terminal for development.',
    howToOpenHint: 'Both the packaged app and the dev mode live in this project folder.',
    promptSection: 'Repro prompt',
    promptSectionDesc: 'Enter one goal and get a copy-ready prompt for Codex / Claude Code / Hermes.',
    promptSeedLabel: 'One-line goal',
    promptSeedPlaceholder: 'For example: turn this into an Electron skill manager and add an anti-drift skill.',
    promptPreview: 'Prompt preview',
    promptCopy: 'Copy prompt',
    promptReset: 'Reset default',
    promptGuard: 'Anti-drift rules',
    promptGuardOne: 'Only change skill management, reproducible prompts, and Codex guardrails.',
    promptGuardTwo: 'Keep the UI Chinese-first; only Codex / Claude Code / Hermes / skill names stay in English.',
    promptGuardThree: 'Self-check before finishing, then report changed files, open steps, and remaining gaps.',
  },
};

function formatDate(value) {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCount(value) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

function badgeText(status, locale) {
  const zhLabels = {
    confirmed: '已确认',
    inferred: '已推断',
    available: '可用',
  };
  const enLabels = {
    confirmed: 'confirmed',
    inferred: 'inferred',
    available: 'available',
  };
  return (locale === 'zh' ? zhLabels : enLabels)[status] || status;
}

function isLikelyEnglish(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const chineseChars = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const latinChars = value.match(/[A-Za-z]/g)?.length || 0;
  return latinChars > chineseChars * 2;
}

function App() {
  const overlayMode = new URLSearchParams(window.location.search).get('overlay');
  const isOverlay = overlayMode === '1' || overlayMode === 'select';
  const [locale, setLocale] = useState(() => {
    try {
      return window.localStorage.getItem('skill-shell-locale') || 'zh';
    } catch {
      return 'zh';
    }
  });
  const [snapshot, setSnapshot] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState('claude');
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [roots, setRoots] = useState(null);
  const [copyState, setCopyState] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(null);
  const [editForm, setEditForm] = useState({ skillName: '', title: '', description: '', body: '' });
  const [translatedTexts, setTranslatedTexts] = useState({});
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [liveStatus, setLiveStatus] = useState({ enabled: false, state: 'idle' });
  const [liveResult, setLiveResult] = useState(null);
  const [regionMode, setRegionMode] = useState(false);
  const [regionDrag, setRegionDrag] = useState(null);
  const [showTranslateTools, setShowTranslateTools] = useState(false);
  const bridge = window.skillShell;
  const t = TEXT[locale] || TEXT.zh;
  useEffect(() => {
    try {
      window.localStorage.setItem('skill-shell-locale', locale);
    } catch {
      // ignore storage failures
    }
  }, [locale]);

  useEffect(() => {
    if (!bridge?.onLiveTranslationUpdate || !bridge?.onLiveTranslationStatus) return undefined;
    const offUpdate = bridge.onLiveTranslationUpdate((payload) => setLiveResult(payload || null));
    const offStatus = bridge.onLiveTranslationStatus((payload) => setLiveStatus(payload || { enabled: false, state: 'idle' }));
    bridge.liveTranslateStatus?.().then((status) => {
      if (status?.ok) {
        setLiveStatus({
          enabled: Boolean(status.enabled),
          state: status.busy ? 'capturing' : status.enabled ? 'translated' : 'idle',
          region: status.region || null,
        });
        if (status.region) {
          setRegionMode(true);
        }
        if (status.lastLiveTranslation) {
          setLiveResult(status.lastLiveTranslation);
        }
      }
    });
    return () => {
      offUpdate?.();
      offStatus?.();
    };
  }, [bridge]);

  useEffect(() => {
    if (!isOverlay || overlayMode !== 'select') return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        window.close();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOverlay, overlayMode]);

  async function loadSnapshot() {
    setError('');
    try {
      if (!bridge?.scan) {
        throw new Error('Electron preload bridge 未注入，请通过 Electron 启动该应用。');
      }
      const data = await bridge.scan();
      startTransition(() => {
        setSnapshot(data);
      });
    } catch (err) {
      setError(err?.message || '扫描失败');
    }
  }

  async function loadRoots() {
    try {
      if (!bridge?.getRoots) return;
      const data = await bridge.getRoots();
      setRoots(data);
    } catch {
      // keep quiet: root shortcuts are optional
    }
  }

  async function openTarget(targetPath, label) {
    if (!targetPath || !bridge?.openPath) return;
    await bridge.openPath(targetPath);
    setCopyState(label || targetPath);
    window.clearTimeout(openTarget._timer);
    openTarget._timer = window.setTimeout(() => setCopyState(''), 1800);
  }

  async function copyText(text, label) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState(label || '已复制');
      window.clearTimeout(copyText._timer);
      copyText._timer = window.setTimeout(() => setCopyState(''), 1800);
    } catch {
      setCopyState('复制失败');
    }
  }

  function skillTextKey(skill, field, value) {
    return `${skill.agentId}|${skill.source}|${skill.name}|${skill.status}|${field}|${String(value || '').trim()}`;
  }

  async function translateIfNeeded(skill, field, value) {
    if (locale !== 'zh') return value;
    if (!bridge?.translateText) return value;
    const text = String(value || '').trim();
    if (!text || !isLikelyEnglish(text)) return text;

    const key = skillTextKey(skill, field, text);
    if (translatedTexts[key]) return translatedTexts[key];

    const result = await bridge.translateText({
      text,
      source: 'en',
      target: 'zh-CN',
    });
    if (!result?.ok) return text;
    const translatedText = result.translatedText || text;
    setTranslatedTexts((current) => {
      if (current[key] === translatedText) return current;
      return { ...current, [key]: translatedText };
    });
    return translatedText;
  }

  function getTranslatedText(skill, field, fallback) {
    if (locale !== 'zh') return fallback;
    const key = skillTextKey(skill, field, fallback);
    return translatedTexts[key] || fallback;
  }

  function openCreateDialog() {
    setEditMode({ type: 'create', agentId: selectedAgent });
    setEditForm({ skillName: '', title: '', description: '', body: '' });
  }

  async function openEditDialog(skill) {
    if (!skill?.source || !bridge?.readSkill) return;
    setError('');
    const result = await bridge.readSkill({ sourcePath: skill.source });
    if (!result?.ok) {
      setError(result?.error || '读取 skill 失败');
      return;
    }
    setEditMode({ type: 'edit', skill });
    setEditForm({
      skillName: result.skillName || skill.name,
      title: result.title || skill.title || skill.name,
      description: result.description || skill.description || '',
      body: result.body || '',
    });
  }

  function openRenameDialog(skill) {
    if (!skill?.source) return;
    setEditMode({ type: 'rename', skill });
    setEditForm({
      skillName: skill.name,
      title: skill.name,
      description: skill.description || '',
      body: '',
    });
  }

  async function submitEdit() {
    if (!bridge) return;
    if (editMode?.type === 'create') {
      const result = await bridge.createSkill({
        agentId: editMode.agentId,
        skillName: editForm.skillName,
        title: editForm.title,
        description: editForm.description,
        body: editForm.body,
      });
      if (!result?.ok) {
        setError(result?.error || '创建失败');
        return;
      }
      setEditMode(null);
      await loadSnapshot();
      return;
    }

    if (editMode?.type === 'edit') {
      const result = await bridge.updateSkill({
        sourcePath: editMode.skill.source,
        skillName: editForm.skillName,
        title: editForm.title,
        description: editForm.description,
        body: editForm.body,
      });
      if (!result?.ok) {
        setError(result?.error || '保存失败');
        return;
      }
      setEditMode(null);
      await loadSnapshot();
      return;
    }

    if (editMode?.type === 'rename') {
      const result = await bridge.renameSkill({
        sourcePath: editMode.skill.source,
        newName: editForm.skillName,
      });
      if (!result?.ok) {
        setError(result?.error || '重命名失败');
        return;
      }
      setEditMode(null);
      await loadSnapshot();
    }
  }

  async function deleteSkill(skill) {
    if (!skill?.source || !bridge?.deleteSkill) return;
    const ok = window.confirm(locale === 'zh'
      ? `确认删除这个 skill 吗？\n\n${skill.name}`
      : `Delete this skill?\n\n${skill.name}`);
    if (!ok) return;
    const result = await bridge.deleteSkill({ sourcePath: skill.source });
    if (!result?.ok) {
      setError(result?.error || '删除失败');
      return;
    }
    if (selectedSkill?.source === skill.source) setSelectedSkill(null);
    await loadSnapshot();
  }

  async function toggleLiveTranslate() {
    if (!bridge?.liveTranslateToggle) return;
    const result = await bridge.liveTranslateToggle();
    if (result?.ok) {
      setLiveStatus((current) => ({ ...current, enabled: Boolean(result.enabled), state: result.enabled ? 'starting' : 'idle' }));
    } else {
      setError(result?.error || '实时翻译启动失败');
    }
  }

  async function startRegionSelection() {
    if (!bridge?.liveTranslateRegionStart) return;
    const result = await bridge.liveTranslateRegionStart();
    if (!result?.ok) {
      setError(result?.error || '区域选择失败');
      return;
    }
    setRegionMode(true);
  }

  async function clearRegionSelection() {
    await bridge?.liveTranslateRegionClear?.();
    setRegionMode(false);
    setRegionDrag(null);
  }

  async function translateOnce() {
    if (!bridge?.liveTranslateOnce) return;
    const result = await bridge.liveTranslateOnce();
    if (!result?.ok) {
      setError(result?.error || '翻译失败');
      return;
    }
    setLiveResult(result);
    setLiveStatus((current) => ({
      ...current,
      state: result.ocrText ? 'translated' : 'no-text',
      region: current.region || null,
    }));
  }

  async function closeOverlay() {
    if (liveStatus.enabled) {
      await toggleLiveTranslate();
    }
    window.close();
  }

  useEffect(() => {
    if (isOverlay) return;
    loadSnapshot();
    loadRoots();
  }, [isOverlay]);

  useEffect(() => {
    if (isOverlay) return;
    if (!snapshot) return;
    if (!snapshot.agents.some((agent) => agent.agentId === selectedAgent)) {
      setSelectedAgent(snapshot.agents[0]?.agentId || 'claude');
    }
  }, [isOverlay, snapshot, selectedAgent]);

  const agents = snapshot?.agents || [];
  const skills = snapshot?.skills || [];
  const visibleSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return skills.filter((skill) => {
      if (skill.agentId !== selectedAgent) return false;
      if (!query) return true;
      const haystack = [
        skill.name,
        skill.title,
        skill.description,
        skill.summary,
        skill.usage,
        skill.evidence,
        skill.source,
        skill.sessionId,
        skill.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, selectedAgent, skills]);

  const agentCards = agents.map((agent) => {
    const meta = AGENT_META[agent.agentId];
    return {
      ...agent,
      meta,
      confirmedCount: skills.filter((skill) => skill.agentId === agent.agentId && skill.status === 'confirmed').length,
      inferredCount: skills.filter((skill) => skill.agentId === agent.agentId && skill.status === 'inferred').length,
      availableCount: skills.filter((skill) => skill.agentId === agent.agentId && skill.status === 'available').length,
    };
  });

  const skillDetail = selectedSkill ? skills.find((skill) => skill.name === selectedSkill.name && skill.agentId === selectedSkill.agentId && skill.status === selectedSkill.status) : null;
  const sourcePath = skillDetail?.source || '';
  const skillBriefSource = skillDetail?.summary || skillDetail?.description || skillDetail?.evidence || t.noSummary;
  const skillUsageSource = skillDetail?.usage || t.skillUsageHint;
  const skillBriefText = skillDetail && locale === 'zh'
    ? getTranslatedText(skillDetail, 'summary', skillBriefSource)
    : skillBriefSource;
  const skillUsageText = skillDetail && locale === 'zh'
    ? getTranslatedText(skillDetail, 'usage', skillUsageSource)
    : skillUsageSource;
  const skillSourceTag = skillDetail?.sourceTag || null;
  const selectedAgentRoot =
    selectedAgent === 'claude'
      ? roots?.claudeSkills
      : selectedAgent === 'codex'
        ? roots?.codexSkills
        : roots?.hermesSkills;
  function formatSkillSourceTag(tag) {
    if (!tag) return '';
    if (tag.kind === 'official') {
      return locale === 'zh' ? '官方' : 'Official';
    }
    if (tag.kind === 'github') {
      const label = tag.label || (locale === 'zh' ? '未知' : 'Unknown');
      return locale === 'zh' ? `GitHub 作者：${label}` : `GitHub author: ${label}`;
    }
    if (tag.kind === 'local') {
      return locale === 'zh' ? '本地' : 'Local';
    }
    return String(tag.label || '');
  }

  useEffect(() => {
    if (isOverlay) return;
    if (!skills.length) return;
    if (!selectedSkill) {
      setSelectedSkill(skills[0]);
    }
  }, [isOverlay, skills, selectedSkill]);

  useEffect(() => {
    if (isOverlay) return;
    if (!visibleSkills.length) {
      setSelectedSkill(null);
      return;
    }
    if (!selectedSkill || !visibleSkills.some((skill) => skill.name === selectedSkill.name && skill.status === selectedSkill.status && skill.agentId === selectedSkill.agentId)) {
      setSelectedSkill(visibleSkills[0]);
    }
  }, [isOverlay, visibleSkills, selectedSkill]);

  useEffect(() => {
    if (isOverlay) return;
    if (locale !== 'zh' || !bridge?.translateText) return;
    let cancelled = false;
    const targets = [...visibleSkills.slice(0, 12)];
    if (skillDetail) targets.push(skillDetail);

    async function warmTranslations() {
      for (const skill of targets) {
        if (cancelled) return;
        const summary = skill.summary || skill.description || '';
        const summaryKey = skillTextKey(skill, 'summary', summary);
        if (summary && isLikelyEnglish(summary) && !translatedTexts[summaryKey]) {
          const result = await bridge.translateText({ text: summary, source: 'en', target: 'zh-CN' });
          if (!cancelled && result?.ok) {
            const translatedText = result.translatedText || summary;
            setTranslatedTexts((current) => (current[summaryKey] ? current : { ...current, [summaryKey]: translatedText }));
          }
        }
        if (skillDetail && skill.source === skillDetail.source && skill.status === skillDetail.status) {
          const usage = skill.usage || '';
          const usageKey = skillTextKey(skill, 'usage', usage);
          if (usage && isLikelyEnglish(usage) && !translatedTexts[usageKey]) {
            const result = await bridge.translateText({ text: usage, source: 'en', target: 'zh-CN' });
            if (!cancelled && result?.ok) {
              const translatedText = result.translatedText || usage;
              setTranslatedTexts((current) => (current[usageKey] ? current : { ...current, [usageKey]: translatedText }));
            }
          }
        }
      }
    }

    warmTranslations();
    return () => {
      cancelled = true;
    };
  }, [isOverlay, bridge, locale, skillDetail, translatedTexts, visibleSkills]);

  async function commitRegionSelection(rect) {
    if (!bridge?.liveTranslateRegionSet) return;
    const result = await bridge.liveTranslateRegionSet({ region: rect });
    if (result?.ok) {
      setRegionMode(false);
      setRegionDrag(null);
      window.close();
      return;
    }
    setError(result?.error || '区域保存失败');
  }

  function normalizedRect(start, current) {
    const x1 = Math.min(start.x, current.x);
    const y1 = Math.min(start.y, current.y);
    const x2 = Math.max(start.x, current.x);
    const y2 = Math.max(start.y, current.y);
    return {
      x: Math.max(0, x1),
      y: Math.max(0, y1),
      width: Math.max(1, x2 - x1),
      height: Math.max(1, y2 - y1),
    };
  }

  if (isOverlay && overlayMode === 'select') {
    const box = regionDrag
      ? normalizedRect(regionDrag.start, regionDrag.current)
      : null;

    return (
      <div
        className="select-overlay"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const point = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          };
          setRegionDrag({ start: point, current: point, selecting: true });
        }}
        onMouseMove={(event) => {
          if (!regionDrag?.selecting) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const point = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          };
          setRegionDrag((current) => (current ? { ...current, current: point } : current));
        }}
        onMouseUp={async () => {
          if (!regionDrag?.selecting) return;
          const nextRect = normalizedRect(regionDrag.start, regionDrag.current);
          if (nextRect.width < 20 || nextRect.height < 20) {
            setRegionDrag(null);
            return;
          }
          setRegionDrag((current) => (current ? { ...current, selecting: false } : current));
          await commitRegionSelection(nextRect);
        }}
      >
        <div className="select-hint">
          <strong>{locale === 'zh' ? '拖动鼠标框选要翻译的区域' : 'Drag to select the area to translate'}</strong>
          <p>{locale === 'zh' ? '选完会自动保存，之后实时翻译只盯着这块区域。按 Esc 退出。' : 'Release to save. Live translation will only watch this area. Press Esc to cancel.'}</p>
        </div>
        {box ? (
          <div
            className="select-box"
            style={{
              left: `${box.x}px`,
              top: `${box.y}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
          />
        ) : null}
      </div>
    );
  }

  if (isOverlay) {
    return (
      <div className="translator-overlay">
        <div className="translator-topbar">
          <div>
            <p className="eyebrow">Live Translate</p>
            <h2>{locale === 'zh' ? '屏幕实时翻译' : 'Live screen translation'}</h2>
          </div>
          <div className="translator-actions">
            <button className="ghost" onClick={toggleLiveTranslate}>
              {liveStatus.enabled ? (locale === 'zh' ? '停止翻译' : 'Stop') : t.liveTranslate}
            </button>
            <button className="ghost" onClick={startRegionSelection}>
              {t.chooseRegion}
            </button>
            <button className="ghost" onClick={clearRegionSelection}>
              {t.clearRegion}
            </button>
            <button className="ghost" onClick={translateOnce}>
              {t.translateOnce}
            </button>
            <button className="ghost" onClick={closeOverlay}>
              {locale === 'zh' ? '关闭' : 'Close'}
            </button>
          </div>
        </div>

        <div className="translator-status">
          <span className={`status-pill ${liveStatus.enabled ? 'on' : 'off'}`}>
            {liveStatus.enabled ? (locale === 'zh' ? '运行中' : 'Running') : (locale === 'zh' ? '已停止' : 'Stopped')}
          </span>
          <span>{locale === 'zh' ? '状态' : 'State'}: {liveStatus.state || 'idle'}</span>
          <span>{locale === 'zh' ? '区域' : 'Region'}: {regionMode ? (locale === 'zh' ? '正在选择' : 'Selecting') : liveStatus.region ? t.regionReady : (locale === 'zh' ? '未设置' : 'Not set')}</span>
        </div>
        <div className="translator-hint">{t.translateOnceHint}</div>

        <div className="translator-card">
          <span>{locale === 'zh' ? '识别到的原文' : 'Recognized text'}</span>
          <p>{liveResult?.ocrText || (locale === 'zh' ? '还没有识别到内容。按快捷键开始。' : 'Nothing recognized yet. Use the shortcut to start.')}</p>
        </div>

        <div className="translator-card highlighted">
          <span>{locale === 'zh' ? '中文翻译' : 'Chinese translation'}</span>
          <p>{liveResult?.translatedText || (locale === 'zh' ? '翻译结果会显示在这里。' : 'The translation will appear here.')}</p>
        </div>

        <div className="translator-footer">
          <button className="ghost" onClick={() => copyText(liveResult?.translatedText || '', locale === 'zh' ? '译文已复制' : 'Translation copied')}>
            {locale === 'zh' ? '复制译文' : 'Copy translation'}
          </button>
          <span>{t.liveTranslateHint}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>Skill Shell</strong>
            <span>{locale === 'zh' ? 'skill 管理器' : 'Skill manager'}</span>
          </div>
        </div>
        <div className="app-actions">
          <span className="scan-status">
            <span className="dot" />
            {formatDate(snapshot?.scannedAt)}
          </span>
          <div className="language-switch">
            <button className={`lang-btn ${locale === 'zh' ? 'active' : ''}`} onClick={() => setLocale('zh')}>{t.chinese}</button>
            <button className={`lang-btn ${locale === 'en' ? 'active' : ''}`} onClick={() => setLocale('en')}>{t.english}</button>
          </div>
          <div className="translate-menu">
            <button
              className={`ghost translate-trigger ${showTranslateTools ? 'active' : ''}`}
              onClick={() => setShowTranslateTools((value) => !value)}
            >
              {locale === 'zh' ? '翻译工具' : 'Translate'}
            </button>
            {showTranslateTools ? (
              <div className="translate-popover">
                <div>
                  <strong>{locale === 'zh' ? '简介自动翻译' : 'Auto-translate summaries'}</strong>
                  <span>{locale === 'zh' ? '中文模式下已自动开启' : 'Enabled in Chinese mode'}</span>
                </div>
                <button
                  className="ghost"
                  onClick={() => {
                    setShowTranslateTools(false);
                    toggleLiveTranslate();
                  }}
                >
                  {liveStatus.enabled
                    ? (locale === 'zh' ? '关闭屏幕翻译' : 'Stop screen translation')
                    : (locale === 'zh' ? '打开屏幕翻译' : 'Screen translation')}
                </button>
                <button
                  className="ghost"
                  onClick={() => {
                    setShowTranslateTools(false);
                    startRegionSelection();
                  }}
                >
                  {locale === 'zh' ? '框选翻译区域' : 'Select translation region'}
                </button>
              </div>
            ) : null}
          </div>
          <button className="primary" onClick={loadSnapshot} disabled={isPending}>
            {isPending ? t.scanning : t.refresh}
          </button>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="panel-grid">
        <div className="panel left">
          <div className="panel-head">
            <h2>Agent</h2>
          </div>
          <div className="agent-list">
            {agentCards.map((agent) => (
              <button
                key={agent.agentId}
                className={`agent-card ${selectedAgent === agent.agentId ? 'active' : ''}`}
                onClick={() => setSelectedAgent(agent.agentId)}
                style={{
                  '--accent': agent.meta?.accent || '#8b8f9a',
                  '--glow': agent.meta?.glow || 'rgba(255,255,255,0.15)',
                }}
              >
                <div className="agent-card-top">
                  <div>
                    <p>{agent.meta?.label || agent.agentId}</p>
                    <span>{formatCount(agent.availableCount)} skills</span>
                  </div>
                  <strong>{formatCount(agent.availableCount)}</strong>
                </div>
                <div className="agent-card-meta">
                  <span>{locale === 'zh' ? '已确认' : 'Confirmed'} {formatCount(agent.confirmedCount)}</span>
                  <span>{locale === 'zh' ? '线索' : 'Clues'} {formatCount(agent.inferredCount)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel middle">
          <div className="panel-title-row">
            <div>
              <h2>{t.skillsTitle(AGENT_META[selectedAgent]?.label || selectedAgent)}</h2>
              <span>{formatCount(visibleSkills.length)} skills</span>
            </div>
            <button className="primary compact" onClick={openCreateDialog}>
              + {t.createSkill}
            </button>
          </div>
          <div className="toolbar">
            <input
              className="search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={locale === 'zh' ? t.searchPlaceholder : t.searchPlaceholder}
            />
          </div>
          <div className="skill-list">
            {visibleSkills.length === 0 ? (
              <div className="empty-state">{searchQuery ? (locale === 'zh' ? '没有找到匹配的 skill。' : 'No skills matched your search.') : t.noSkills}</div>
            ) : (
              visibleSkills.map((skill) => (
                <div
                  key={`${skill.agentId}:${skill.name}:${skill.status}:${skill.source}`}
                  className={`skill-row ${selectedSkill?.name === skill.name && selectedSkill?.status === skill.status ? 'selected' : ''}`}
                  onClick={() => setSelectedSkill(skill)}
                  role="button"
                  tabIndex={0}
                >
                  <div>
                    <strong>{skill.name}</strong>
                    <p>{locale === 'zh' ? translatedTexts[skillTextKey(skill, 'summary', skill.summary || skill.description || skill.source)] || skill.summary || skill.description || skill.source : skill.summary || skill.description || skill.source}</p>
                  </div>
                  <div className="skill-badges">
                    <span className={`badge ${skill.status}`}>{badgeText(skill.status, locale)}</span>
                    {skill.sourceTag?.kind ? (
                      <span className={`badge source-tag ${skill.sourceTag.kind}`}>
                        {formatSkillSourceTag(skill.sourceTag)}
                      </span>
                    ) : null}
                    {skill.status === 'available' ? (
                      <button
                        className="mini-action danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteSkill(skill);
                        }}
                      >
                        {t.deleteSkill}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel right">
          <div className="panel-title-row detail-title">
            <div>
              <span className="section-label">{t.skillBrief}</span>
              <h2>{skillDetail?.title || selectedSkill?.name || t.unselected}</h2>
            </div>
            {skillSourceTag?.kind ? (
              <div className={`detail-tag ${skillSourceTag.kind}`}>{formatSkillSourceTag(skillSourceTag)}</div>
            ) : null}
          </div>
          <div className="action-row">
            <button className="ghost" onClick={() => openTarget(sourcePath, t.openSource)}>{t.openSource}</button>
            {skillDetail?.status === 'available' ? (
              <>
                <button className="ghost" onClick={() => openEditDialog(skillDetail)}>{t.editSkill}</button>
                <button className="ghost" onClick={() => openRenameDialog(skillDetail)}>{t.renameSkill}</button>
                <button className="ghost danger-button" onClick={() => deleteSkill(skillDetail)}>{t.deleteSkill}</button>
              </>
            ) : null}
          </div>
          <div className="detail-stack">
            <div className="detail-card detail-brief simple">
              <p>{skillBriefText}</p>
              {skillUsageText && skillUsageText !== t.skillUsageHint ? (
                <div className="usage-block">
                  <span>{t.skillUsage}</span>
                  <p>{skillUsageText}</p>
                </div>
              ) : null}
            </div>
            <div className="source-line">
              <span>{locale === 'zh' ? '来源' : 'Source'}</span>
              <code>{sourcePath || '-'}</code>
            </div>
          </div>
          <div className="right-footer">
            <button className="ghost" onClick={() => openTarget(selectedAgentRoot, `${AGENT_META[selectedAgent]?.label || selectedAgent} skill 目录`)}>
              {t.openDir}
            </button>
            {copyState ? <span>{copyState}</span> : null}
          </div>
        </div>
      </section>

      {editMode ? (
        <div className="modal-backdrop" onClick={() => setEditMode(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h3>{editMode.type === 'create' ? t.createSkill : editMode.type === 'edit' ? t.editSkill : t.renameSkill}</h3>
              <button className="ghost" onClick={() => setEditMode(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <label>
                <span>{locale === 'zh' ? 'skill 名称' : 'Skill name'}</span>
                <input
                  value={editForm.skillName}
                  onChange={(event) => setEditForm((current) => ({ ...current, skillName: event.target.value }))}
                  placeholder={locale === 'zh' ? '例如：idea-refine' : 'e.g. idea-refine'}
                />
              </label>
              {editMode.type === 'create' || editMode.type === 'edit' ? (
                <>
                  <label>
                    <span>{locale === 'zh' ? '标题' : 'Title'}</span>
                    <input
                      value={editForm.title}
                      onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder={locale === 'zh' ? '给这个 skill 起个标题' : 'Give this skill a title'}
                    />
                  </label>
                  <label>
                    <span>{locale === 'zh' ? '说明' : 'Description'}</span>
                    <textarea
                      rows="3"
                      value={editForm.description}
                      onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder={locale === 'zh' ? '一句话说明这个 skill 干什么' : 'Describe what this skill does'}
                    />
                  </label>
                  {editMode.type === 'edit' ? (
                    <div className="detail-note">
                      {locale === 'zh'
                        ? '这里会直接改 `SKILL.md`。如果你只想改文件夹名字，用“重命名”。'
                        : 'This will update `SKILL.md` directly. Use “Rename” if you only want to change the folder name.'}
                    </div>
                  ) : null}
                  <label>
                    <span>{locale === 'zh' ? '正文' : 'Body'}</span>
                    <textarea
                      rows="7"
                      value={editForm.body}
                      onChange={(event) => setEditForm((current) => ({ ...current, body: event.target.value }))}
                      placeholder={locale === 'zh' ? '写下 skill 的详细内容' : 'Write the skill instructions here'}
                    />
                  </label>
                </>
              ) : null}
            </div>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setEditMode(null)}>
                {locale === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button className="primary" onClick={submitEdit}>
                {editMode.type === 'create' ? t.createSkill : editMode.type === 'edit' ? t.editSkill : t.renameSkill}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
