import React, { useEffect, useState, useCallback } from 'react';
import { Box, Button, Typography, Avatar, IconButton, Stack } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';

interface Image {
  id: number;
  url: string;
  status: number; // 0:未チェック, 1:必要, 99:不要
  created_at: string;
}

const fetchImages = async (): Promise<Image[]> => {
  const res = await fetch('http://localhost:8000/images/?limit=1000');
  return res.json();
};

const fetchImageCount = async (): Promise<number> => {
  const res = await fetch('http://localhost:8000/images/count');
  const data = await res.json();
  return data.count || 0;
};

const ImageCheck: React.FC = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [checked, setChecked] = useState<Image[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [undoStack, setUndoStack] = useState<{img: Image, prevStatus: number}[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    Promise.all([
      fetchImages(),
      fetchImageCount()
    ]).then(([imgs, count]) => {
      // status=0のみを対象
      const unchecked = imgs.filter(img => img.status === 0);
      setImages(unchecked);
      setChecked([]);
      setCurrentIdx(0);
      setTotalCount(count);
      setLoading(false);
    });
  }, []);

  const handleFlag = useCallback(async (flag: 1 | 99) => {
    if (currentIdx >= images.length) return;
    const img = images[currentIdx];
    const prevStatus = img.status;
    await fetch(`http://localhost:8000/images/${img.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: flag })
    });
    setUndoStack([...undoStack, { img, prevStatus }]);
    setChecked([...checked, { ...img, status: flag }]);
    setCurrentIdx(currentIdx + 1);
  }, [images, currentIdx, checked, undoStack]);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    await fetch(`http://localhost:8000/images/${last.img.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: last.prevStatus })
    });
    setUndoStack(undoStack.slice(0, -1));
    setChecked(checked.slice(0, -1));
    setCurrentIdx(currentIdx - 1);
  }, [undoStack, checked, currentIdx]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'y') handleFlag(1);
      if (e.key === 'n') handleFlag(99);
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) handleUndo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFlag, handleUndo]);

  if (loading) return <Typography>読み込み中...</Typography>;
  const current = images[currentIdx];
  const next = images[currentIdx + 1];
  const uncheckedCount = images.length - currentIdx;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>
        全画像数: {totalCount}　未フラグ画像数: {uncheckedCount}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 2 }}>
        {/* 左：チェック済み画像リスト */}
        <Stack spacing={1} sx={{ minWidth: 100, alignItems: 'flex-end' }}>
          {checked.slice(-5).map(img => (
            <Avatar
              key={img.id}
              src={img.url}
              variant="square"
              sx={{
                width: 48,
                height: 48,
                border: '2.5px solid',
                borderColor: img.status === 1
                  ? 'primary.main'
                  : img.status === 99
                    ? 'secondary.main'
                    : '#ccc'
              }}
            />
          ))}
          <IconButton onClick={handleUndo} disabled={undoStack.length === 0} size="small">
            <UndoIcon />
          </IconButton>
        </Stack>
        {/* 中央：現在の画像 */}
        <Box sx={{ mx: 4, textAlign: 'center' }}>
          {current ? (
            <>
              <Avatar src={current.url} variant="square" sx={{ width: 320, height: 320, mb: 2 }} />
              <Typography variant="body2">{current.url}</Typography>
              <Box sx={{ mt: 2 }}>
                <Button variant="contained" color="primary" onClick={() => handleFlag(1)} sx={{ mr: 2 }}>必要 (y)</Button>
                <Button variant="contained" color="secondary" onClick={() => handleFlag(99)}>不要 (n)</Button>
              </Box>
            </>
          ) : (
            <Typography>すべての画像をチェックしました</Typography>
          )}
        </Box>
        {/* 右：次の画像 */}
        <Stack spacing={1} sx={{ minWidth: 100, alignItems: 'flex-start' }}>
          {next && <Avatar src={next.url} variant="square" sx={{ width: 64, height: 64, border: '2px solid #eee' }} />}
        </Stack>
      </Box>
    </Box>
  );
};

export default ImageCheck; 