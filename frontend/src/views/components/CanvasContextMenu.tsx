import { Menu, MenuItem, ListItemIcon, ListItemText, Typography, Divider } from '@mui/material';
import { ChatBubbleOutline as ChatIcon } from '@mui/icons-material';
import { useStore } from '../../models/store';
import type { NodeData } from '../../models/store';
import { t } from '../../services/i18n';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  nodes: NodeData[];
  mode: 'single' | 'selection';
  onDismiss: () => void;
}

export function CanvasContextMenu({ x, y, nodes, mode, onDismiss }: CanvasContextMenuProps) {
  const setChatContext = useStore((s) => s.setChatContext);
  const language = useStore((s) => s.language);
  const tr = t(language);

  const handleDiscuss = () => {
    const nodeIds = nodes.map((n) => n.id);
    setChatContext({ nodeIds, mode });
    onDismiss();
  };

  const label =
    mode === 'single'
      ? tr.canvas.discussSingle
      : `${tr.canvas.discussSelection} (${nodes.length})`;

  let summary = nodes
    .slice(0, 5)
    .map((n) => n.label)
    .join(', ');
  if (nodes.length > 5) summary += ` +${nodes.length - 5}`;

  return (
    <Menu
      open
      onClose={onDismiss}
      anchorReference="anchorPosition"
      anchorPosition={{ top: y, left: x }}
      slotProps={{
        paper: {
          sx: {
            minWidth: 220,
            borderRadius: 2,
            mt: 0,
          },
        },
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'left',
      }}
    >
      <MenuItem disabled sx={{ opacity: 0.7, cursor: 'default' }}>
        <Typography
          variant="bodySmall"
          color="text.disabled"
          noWrap
          sx={{ maxWidth: 260, fontFamily: '"JetBrains Mono", monospace' }}
        >
          {summary}
        </Typography>
      </MenuItem>
      <Divider />
      <MenuItem onClick={handleDiscuss}>
        <ListItemIcon>
          <ChatIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        </ListItemIcon>
        <ListItemText
          primary={label}
          primaryTypographyProps={{ variant: 'bodyMedium', fontWeight: 500 }}
        />
      </MenuItem>
    </Menu>
  );
}
