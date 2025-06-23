import React, { useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import { useState } from 'react';
import Crawl from './components/Crawl';
import ImageCheck from './components/ImageCheck';
import ImageList from './components/ImageList';

const App: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteMsg(null);
    try {
      const res = await fetch('http://localhost:8000/delete-all', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || '削除に失敗しました');
      }
      setDeleteMsg('全データを削除しました');
    } catch (e: any) {
      setDeleteMsg(e.message);
    } finally {
      setDeleting(false);
      setOpen(false);
    }
  }, []);

  return (
    <Router>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            画像クローラー
          </Typography>
          <Button color="inherit" component={Link} to="/crawl">クロール</Button>
          <Button color="inherit" component={Link} to="/check">画像チェック</Button>
          <Button color="inherit" component={Link} to="/list">画像一覧</Button>
          <Button color="secondary" variant="outlined" sx={{ ml: 2, borderColor: 'white', color: 'white' }} onClick={() => setOpen(true)}>
            全データ削除
          </Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ p: 3 }}>
        <Routes>
          <Route path="/crawl" element={<Crawl />} />
          <Route path="/check" element={<ImageCheck />} />
          <Route path="/list" element={<ImageList />} />
          <Route path="/" element={<Crawl />} />
        </Routes>
        <Dialog open={open} onClose={() => setOpen(false)}>
          <DialogTitle>全データ削除の確認</DialogTitle>
          <DialogContent>
            <DialogContentText>
              本当に全ての画像・ページデータを削除しますか？この操作は元に戻せません。
            </DialogContentText>
            {deleteMsg && <Box sx={{ mt: 2, color: 'red' }}>{deleteMsg}</Box>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} disabled={deleting}>キャンセル</Button>
            <Button onClick={handleDelete} color="secondary" disabled={deleting} autoFocus>
              {deleting ? '削除中...' : '削除する'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Router>
  );
};

export default App;
