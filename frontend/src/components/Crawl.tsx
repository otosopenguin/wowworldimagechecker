import React, { useState, useRef } from 'react';
import { TextField, Button, Box, Typography, Alert, LinearProgress, Tabs, Tab, Paper } from '@mui/material';
import { CloudUpload } from '@mui/icons-material';

const Crawl: React.FC = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ total: number; current: number; status: string }>({ total: 0, current: 0, status: 'idle' });
  const [tabValue, setTabValue] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pollProgress = () => {
    intervalRef.current = setInterval(async () => {
      const res = await fetch('http://localhost:8000/crawl/progress');
      const data = await res.json();
      setProgress(data);
      if (data.status === 'done' || data.status === 'error') {
        clearInterval(intervalRef.current!);
        setLoading(false);
        setMessage(data.status === 'done' ? 'クロールが完了しました' : 'クロール中にエラーが発生しました');
      }
    }, 1000);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/plain') {
      setUploadedFile(file);
      setFileName(file.name);
    } else {
      setError('テキストファイル（.txt）を選択してください');
    }
  };

  const handleCrawlSitemap = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    setProgress({ total: 0, current: 0, status: 'idle' });
    try {
      const res = await fetch('http://localhost:8000/crawl/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sitemap_url: url })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'クロールに失敗しました');
      }
      pollProgress();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const handleCrawlFile = async () => {
    if (!uploadedFile) {
      setError('ファイルを選択してください');
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);
    setProgress({ total: 0, current: 0, status: 'idle' });

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const res = await fetch('http://localhost:8000/crawl/file', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'クロールに失敗しました');
      }
      pollProgress();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setError(null);
    setMessage(null);
  };

  const percent = progress.total > 0 ? Math.floor((progress.current / progress.total) * 100) : 0;

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" gutterBottom>URLクロール</Typography>
      
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} centered>
          <Tab label="サイトマップXML" />
          <Tab label="テキストファイル" />
        </Tabs>
      </Paper>

      {tabValue === 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>サイトマップXMLからクロール</Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="サイトマップURL"
              variant="outlined"
              fullWidth
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/sitemap.xml"
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleCrawlSitemap}
              disabled={loading || !url}
            >
              {loading ? 'クロール中...' : 'クロール'}
            </Button>
          </Box>
        </Box>
      )}

      {tabValue === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>テキストファイルからクロール</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            1行に1つのURLが記載されたテキストファイルをアップロードしてください
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
            <input
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              ref={fileInputRef}
              style={{ display: 'none' }}
            />
            <Button
              variant="outlined"
              startIcon={<CloudUpload />}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              ファイルを選択
            </Button>
            {fileName && (
              <Typography variant="body2" color="primary">
                選択済み: {fileName}
              </Typography>
            )}
            <Button
              variant="contained"
              color="primary"
              onClick={handleCrawlFile}
              disabled={loading || !uploadedFile}
            >
              {loading ? 'クロール中...' : 'クロール'}
            </Button>
          </Box>
        </Box>
      )}

      {loading && (
        <Box sx={{ my: 2 }}>
          <LinearProgress variant={progress.total > 0 ? 'determinate' : 'indeterminate'} value={percent} />
          <Typography variant="body2" sx={{ mt: 1 }}>
            {progress.total > 0
              ? `進捗: ${progress.current} / ${progress.total}（${percent}%）`
              : '進捗取得中...'}
          </Typography>
        </Box>
      )}
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
    </Box>
  );
};

export default Crawl; 