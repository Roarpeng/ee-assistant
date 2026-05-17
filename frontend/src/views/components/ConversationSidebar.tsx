import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStore } from '../../models/store';
import {
  deleteConversationHistory,
  deriveConversationTitle,
  loadConversationMetas,
  saveConversationMessages,
  saveConversationMetas,
  type ConversationMeta,
} from '../../services/conversations';
import { listTemplates, type Template } from '../../services/templates';
import { OrgSettingsPanel } from './OrgSettingsPanel';
import {
  Box,
  Typography,
  IconButton,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  InputAdornment,
  Divider,
  Paper,
  Menu,
  MenuItem,
  ListItemIcon,
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(timestamp).toLocaleDateString();
}

export function ConversationSidebar() {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const messages = useStore((s) => s.messages);
  const [conversations, setConversations] = useState<ConversationMeta[]>(loadConversationMetas);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showOrgSettings, setShowOrgSettings] = useState(false);
  const newButtonRef = useRef<HTMLButtonElement>(null);

  // Update conversation list when messages change
  useEffect(() => {
    if (!project) return;
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const preview = lastMsg ? lastMsg.content.slice(0, 60) : '';
    const autoTitle = deriveConversationTitle(messages, project.name || '新对话');
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== project.id);
      updated.unshift({
        id: project.id,
        name: autoTitle,
        lastMessage: preview,
        updatedAt: Date.now(),
      });
      // Keep max 30 conversations
      const trimmed = updated.slice(0, 30);
      saveConversationMetas(trimmed);
      return trimmed;
    });
  }, [messages.length, project?.id, project?.name]);

  const filteredConversations = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return conversations;
    return conversations.filter((conv) =>
      [conv.name, conv.lastMessage].some((value) => value.toLowerCase().includes(keyword))
    );
  }, [conversations, search]);

  const handleNewConversation = useCallback(async (preserveCanvas: boolean) => {
    setShowNewMenu(false);
    await useStore.getState().newProject({ preserveCanvas });
  }, []);

  const handleFromTemplate = useCallback(async (template: Template) => {
    setShowNewMenu(false);
    await useStore.getState().newProject({
      preserveCanvas: false,
      seedPrompt: template.seedPrompt,
    });
  }, []);

  const templates = useMemo(() => listTemplates(), []);

  const handleSwitchConversation = useCallback(async (conv: ConversationMeta) => {
    const s = useStore.getState();
    // Save current conversation before switching
    if (s.project && s.project.id !== conv.id) {
      saveConversationMessages(s.project.id, s.messages);
    }
    setProject({ id: conv.id, name: conv.name });
    await useStore.getState().loadChatHistory(conv.id);
  }, [setProject]);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversationMetas(next);
      return next;
    });
    deleteConversationHistory(id);
  }, []);

  if (collapsed) {
    return (
      <Box
        sx={{
          width: 40,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: 2,
          gap: 1,
          bgcolor: 'surfaceContainer',
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <IconButton
          onClick={() => setCollapsed(false)}
          size="small"
          title="展开对话列表"
          sx={{
            width: 28,
            height: 28,
            bgcolor: 'surfaceContainerHigh',
            color: 'text.secondary',
            fontSize: '0.75rem',
            borderRadius: 1,
            '&:hover': { bgcolor: 'surfaceContainerHigh' },
          }}
        >
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </IconButton>
        <IconButton
          onClick={() => handleNewConversation(false)}
          size="small"
          title="新对话"
          sx={{
            width: 28,
            height: 28,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            fontWeight: 700,
            fontSize: '0.875rem',
            borderRadius: 1,
            '&:hover': { bgcolor: 'primary.dark' },
          }}
        >
          <AddIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: 256,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'surfaceContainer',
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              fontSize: '0.6875rem',
              fontWeight: 500,
            }}
          >
            历史对话
          </Typography>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ fontSize: '0.625rem', mt: 0.25, display: 'block' }}
          >
            可搜索、自动命名、继续上下文
          </Typography>
        </Box>
        <IconButton
          onClick={() => setCollapsed(true)}
          size="small"
          title="收起"
          sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' }, fontSize: '0.75rem' }}
        >
          <ChevronLeftIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* New Conversation + Search */}
      <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider', borderOpacity: 0.7, flexShrink: 0 }}>
        <Box sx={{ position: 'relative' }}>
          <Button
            ref={newButtonRef}
            onClick={() => setShowNewMenu((v) => !v)}
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            sx={{
              py: 1.25,
              fontWeight: 700,
              fontSize: '0.75rem',
              borderRadius: 3,
              boxShadow: '0 4px 6px -1px rgba(79,70,229,0.15)',
              textTransform: 'none',
              justifyContent: 'flex-start',
              pl: 2,
            }}
          >
            新对话
          </Button>

          {/* New conversation dropdown menu */}
          <Menu
            open={showNewMenu}
            onClose={() => setShowNewMenu(false)}
            anchorEl={newButtonRef.current}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 0.5,
                  width: newButtonRef.current?.offsetWidth ?? 224,
                  maxHeight: '60vh',
                  overflowY: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 2,
                  boxShadow: 8,
                  p: 0.75,
                },
              },
            }}
          >
            <MenuItem
              onClick={() => handleNewConversation(false)}
              disableRipple
              sx={{
                display: 'block',
                whiteSpace: 'normal',
                borderRadius: 1,
                px: 1.5,
                py: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Typography variant="body2" fontWeight={700} color="text.primary">
                清空画布开始
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block' }}>
                新需求、新拓扑和新 BOM
              </Typography>
            </MenuItem>
            <MenuItem
              onClick={() => handleNewConversation(true)}
              disableRipple
              sx={{
                display: 'block',
                whiteSpace: 'normal',
                borderRadius: 1,
                px: 1.5,
                py: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Typography variant="body2" fontWeight={700} color="text.primary">
                沿用当前画布继续
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block' }}>
                保留拓扑、BOM 和代码，仅开启新对话
              </Typography>
            </MenuItem>
            <Divider sx={{ my: 0.5 }} />
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{
                display: 'block',
                px: 1.5,
                py: 0.5,
                fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontSize: '0.5625rem',
              }}
            >
              从行业模板开始
            </Typography>
            {templates.map((tpl) => (
              <MenuItem
                key={tpl.id}
                onClick={() => handleFromTemplate(tpl)}
                disableRipple
                sx={{
                  display: 'block',
                  whiteSpace: 'normal',
                  borderRadius: 1,
                  px: 1.5,
                  py: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Typography variant="body2" fontWeight={700} color="text.primary">
                  {tpl.name}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{
                    mt: 0.25,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {tpl.summary}
                </Typography>
              </MenuItem>
            ))}
          </Menu>
        </Box>

        {/* Search */}
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索对话..."
          size="small"
          fullWidth
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                </InputAdornment>
              ),
              sx: {
                fontSize: '0.75rem',
                borderRadius: 3,
                bgcolor: 'background.default',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'divider',
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'primary.main',
                },
                pl: 0.5,
              },
            },
          }}
          sx={{ mt: 1 }}
        />
      </Box>

      {/* Conversation List */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 0.75,
          '& > * + *': { mt: 0.25 },
        }}
      >
        {filteredConversations.map((conv) => {
          const isActive = project?.id === conv.id;
          return (
            <ListItemButton
              key={conv.id}
              onClick={() => handleSwitchConversation(conv)}
              disableRipple
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                px: 1.5,
                py: 1,
                borderRadius: 2,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                border: 1,
                borderColor: isActive ? 'primary.main' : 'transparent',
                ...(isActive
                  ? {
                      bgcolor: (t) =>
                        t.palette.mode === 'dark'
                          ? 'rgba(129, 140, 248, 0.15)'
                          : 'rgba(79, 70, 229, 0.1)',
                      '&:hover': {
                        bgcolor: (t) =>
                          t.palette.mode === 'dark'
                            ? 'rgba(129, 140, 248, 0.22)'
                            : 'rgba(79, 70, 229, 0.16)',
                      },
                    }
                  : {
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography
                  variant="body2"
                  fontWeight={isActive ? 700 : 500}
                  color={isActive ? 'primary.main' : 'text.secondary'}
                  noWrap
                  sx={{ flex: 1, mr: 1 }}
                >
                  {conv.name}
                </Typography>
                <IconButton
                  onClick={(e) => handleDelete(e, conv.id)}
                  size="small"
                  title="删除"
                  sx={{
                    opacity: 0,
                    color: 'text.disabled',
                    '&:hover': { color: 'error.main' },
                    flexShrink: 0,
                    fontSize: '0.625rem',
                    p: 0.25,
                    '.MuiListItemButton-root:hover &': { opacity: 1 },
                  }}
                >
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
              <Typography
                variant="caption"
                color="text.disabled"
                noWrap
                sx={{ mt: 0.25, fontSize: '0.625rem', display: 'block' }}
              >
                {conv.lastMessage || '新对话'}
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ mt: 0.25, fontSize: '0.5625rem', display: 'block' }}
              >
                {formatRelativeTime(conv.updatedAt)}
              </Typography>
            </ListItemButton>
          );
        })}
        {filteredConversations.length === 0 && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ textAlign: 'center', py: 4, px: 1, fontSize: '0.625rem', display: 'block' }}
          >
            {search ? '没有匹配的历史对话。' : <>暂无历史对话。<br />点击"+ 新对话"开始</>}
          </Typography>
        )}
      </Box>

      {/* Footer — org settings entry. Anchored at the bottom of the
          sidebar so it survives long conversation lists scrolling. */}
      <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', p: 1 }}>
        <ListItemButton
          onClick={() => setShowOrgSettings(true)}
          disableRipple
          sx={{
            px: 1.5,
            py: 1,
            borderRadius: 2,
            color: 'text.secondary',
            fontWeight: 700,
            fontSize: '0.75rem',
            '&:hover': {
              bgcolor: 'action.hover',
              color: 'text.primary',
            },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="body2" fontWeight={700} color="inherit" sx={{ fontSize: '0.75rem' }}>
            组织设置
          </Typography>
          <SettingsIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
        </ListItemButton>
      </Box>

      <OrgSettingsPanel
        open={showOrgSettings}
        onClose={() => setShowOrgSettings(false)}
      />
    </Box>
  );
}
