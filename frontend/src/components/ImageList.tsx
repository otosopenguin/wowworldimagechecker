import React, { useEffect, useState } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Radio, RadioGroup, FormControlLabel, Avatar, Typography
} from '@mui/material';

interface Image {
  id: number;
  url: string;
  status: number; // 0:未チェック, 1:必要, 99:不要
  created_at: string;
}

interface Page {
  id: number;
  url: string;
  images: Image[];
}

const statusLabels = {
  0: '未チェック',
  1: '必要',
  99: '不要',
};

const ImageList: React.FC = () => {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/pages/?limit=100')
      .then(res => res.json())
      .then(data => {
        setPages(data);
        setLoading(false);
      });
  }, []);

  const handleStatusChange = async (imageId: number, status: number) => {
    await fetch(`http://localhost:8000/images/${imageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    setPages(pages => pages.map(page => ({
      ...page,
      images: page.images.map(img => img.id === imageId ? { ...img, status } : img)
    })));
  };

  if (loading) return <Typography>読み込み中...</Typography>;

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>ページURL</TableCell>
            <TableCell>画像URL</TableCell>
            <TableCell align="center">ステータス</TableCell>
            <TableCell>画像</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pages.map(page => (
            page.images.length === 0 ? (
              <TableRow key={`page-${page.id}-empty`}>
                <TableCell rowSpan={1}>{page.url}</TableCell>
                <TableCell colSpan={3} align="center">画像なし</TableCell>
              </TableRow>
            ) : (
              page.images.map((img, idx) => (
                <TableRow key={img.id}>
                  {idx === 0 && (
                    <TableCell rowSpan={page.images.length} style={{ verticalAlign: 'middle', minWidth: 200 }}>
                      {page.url}
                    </TableCell>
                  )}
                  <TableCell>{img.url}</TableCell>
                  <TableCell align="center">
                    <RadioGroup
                      row
                      value={img.status}
                      onChange={e => handleStatusChange(img.id, Number(e.target.value))}
                    >
                      <FormControlLabel value={0} control={<Radio color="default" />} label="未" />
                      <FormControlLabel value={1} control={<Radio color="primary" />} label="必要" />
                      <FormControlLabel value={99} control={<Radio color="secondary" />} label="不要" />
                    </RadioGroup>
                  </TableCell>
                  <TableCell>
                    <Avatar variant="square" src={img.url} alt="img" sx={{ width: 64, height: 64 }} />
                  </TableCell>
                </TableRow>
              ))
            )
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ImageList; 