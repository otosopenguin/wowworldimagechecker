from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, joinedload, Session
from datetime import datetime
import requests
from bs4 import BeautifulSoup
import logging
import time
from typing import List, Optional
from pydantic import BaseModel, Field
from contextlib import contextmanager
import io
import threading

# ロギングの設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORSの設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# データベースの設定
DATABASE_URL = "mysql+pymysql://user:password@db/image_crawler"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# セッション管理用のコンテキストマネージャー
@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# データベース依存性
def get_db_session():
    with get_db() as db:
        yield db

# 中間テーブルの定義
image_page_relation = Table(
    'image_page_relations',
    Base.metadata,
    Column('image_id', Integer, ForeignKey('images.id'), primary_key=True),
    Column('page_id', Integer, ForeignKey('pages.id'), primary_key=True),
    Column('created_at', DateTime, default=datetime.utcnow)
)

class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(2048), unique=True, index=True)
    status = Column(Integer, default=0)  # 0:未チェック, 1:必要, 99:不要
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # リレーションシップ
    pages = relationship("Page", secondary=image_page_relation, back_populates="images", lazy='select')

class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(2048), unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # リレーションシップ
    images = relationship("Image", secondary=image_page_relation, back_populates="pages", lazy='select')

# Pydanticモデル
class SitemapRequest(BaseModel):
    sitemap_url: str

class FileRequest(BaseModel):
    urls: List[str]

class PageBase(BaseModel):
    url: str

class ImageBase(BaseModel):
    url: str
    status: int = 0

class ImageResponse(ImageBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

class PageResponse(PageBase):
    id: int
    created_at: datetime
    images: List[ImageResponse] = Field(default_factory=list)

    class Config:
        orm_mode = True

class ImageUpdateRequest(BaseModel):
    status: int

# データベースの初期化
def init_db():
    retries = 5
    while retries > 0:
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables created successfully")
            return
        except Exception as e:
            retries -= 1
            if retries == 0:
                logger.error(f"Failed to create database tables: {e}")
                raise
            logger.warning(f"Failed to connect to database (attempt {5-retries}/5): {e}")
            time.sleep(5)

init_db()

crawl_progress = {"total": 0, "current": 0, "status": "idle"}

@app.get("/")
def read_root():
    return {"message": "Image Crawler API"}

@app.post("/crawl/sitemap")
def crawl_sitemap(request: SitemapRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db_session)):
    def crawl_task():
        global crawl_progress
        try:
            def get_all_urls(sitemap_url):
                response = requests.get(sitemap_url)
                soup = BeautifulSoup(response.text, 'lxml-xml')
                urls = []
                if soup.find('sitemapindex'):
                    for sitemap in soup.find_all('sitemap'):
                        loc = sitemap.find('loc')
                        if loc and loc.text:
                            urls.extend(get_all_urls(loc.text))
                else:
                    urls = [loc.text for loc in soup.find_all('loc')]
                return urls

            urls = get_all_urls(request.sitemap_url)
            crawl_progress["total"] = len(urls)
            crawl_progress["current"] = 0
            crawl_progress["status"] = "running"
            
            for idx, url in enumerate(urls):
                try:
                    page = db.query(Page).filter(Page.url == url).first()
                    if not page:
                        page = Page(url=url)
                        db.add(page)
                        db.flush()

                    page_response = requests.get(url)
                    page_soup = BeautifulSoup(page_response.text, 'html.parser')
                    images = page_soup.find_all('img')

                    for img in images:
                        img_url = img.get('src')
                        if img_url:
                            if not img_url.startswith(('http://', 'https://')):
                                img_url = requests.compat.urljoin(url, img_url)
                            image = db.query(Image).filter(Image.url == img_url).first()
                            if not image:
                                image = Image(url=img_url, status=0)
                                db.add(image)
                                db.flush()
                            if image not in page.images:
                                page.images.append(image)
                    db.commit()
                    time.sleep(1)
                except Exception as e:
                    logger.error(f"Error processing URL {url}: {e}")
                    db.rollback()
                    continue
                crawl_progress["current"] = idx + 1
            crawl_progress["status"] = "done"
        except Exception as e:
            crawl_progress["status"] = "error"
            logger.error(f"Error in crawl_task: {e}")

    background_tasks.add_task(crawl_task)
    return {"message": "Crawling started"}

@app.post("/crawl/file")
async def crawl_file(file: UploadFile = File(...), db: Session = Depends(get_db_session)):
    if not file.filename.endswith('.txt'):
        raise HTTPException(status_code=400, detail="テキストファイル（.txt）をアップロードしてください")
    
    try:
        content = await file.read()
        urls = [line.strip() for line in content.decode('utf-8').split('\n') if line.strip()]
        
        if not urls:
            raise HTTPException(status_code=400, detail="ファイルに有効なURLが含まれていません")
        
        # 同期的に処理を開始
        global crawl_progress
        crawl_progress["total"] = len(urls)
        crawl_progress["current"] = 0
        crawl_progress["status"] = "running"
        
        # バックグラウンドで処理を実行
        def crawl_task():
            try:
                for idx, url in enumerate(urls):
                    try:
                        # 新しいセッションを作成
                        with get_db() as task_db:
                            page = task_db.query(Page).filter(Page.url == url).first()
                            if not page:
                                page = Page(url=url)
                                task_db.add(page)
                                task_db.flush()

                            page_response = requests.get(url)
                            page_soup = BeautifulSoup(page_response.text, 'html.parser')
                            images = page_soup.find_all('img')

                            for img in images:
                                img_url = img.get('src')
                                if img_url:
                                    if not img_url.startswith(('http://', 'https://')):
                                        img_url = requests.compat.urljoin(url, img_url)
                                    image = task_db.query(Image).filter(Image.url == img_url).first()
                                    if not image:
                                        image = Image(url=img_url, status=0)
                                        task_db.add(image)
                                        task_db.flush()
                                    if image not in page.images:
                                        page.images.append(image)
                            task_db.commit()
                    except Exception as e:
                        logger.error(f"Error processing URL {url}: {e}")
                        continue
                    crawl_progress["current"] = idx + 1
                    time.sleep(1)
                crawl_progress["status"] = "done"
            except Exception as e:
                crawl_progress["status"] = "error"
                logger.error(f"Error in crawl_task: {e}")

        thread = threading.Thread(target=crawl_task)
        thread.daemon = True
        thread.start()
        
        return {"message": "Crawling started", "urls_count": len(urls)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイル処理エラー: {str(e)}")

# 既存の/crawlエンドポイントを削除または非推奨にする
@app.post("/crawl")
def crawl_sitemap_legacy(request: SitemapRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db_session)):
    # 後方互換性のため、既存のエンドポイントを維持
    return crawl_sitemap(request, background_tasks, db)

@app.get("/crawl/progress")
def get_crawl_progress():
    return crawl_progress

@app.get("/images/", response_model=List[ImageResponse])
def get_images(skip: int = 0, limit: int = 50, db: Session = Depends(get_db_session)):
    images = db.query(Image).offset(skip).limit(limit).all()
    return images

@app.get("/pages/", response_model=List[PageResponse])
def get_pages(skip: int = 0, limit: int = 50, db: Session = Depends(get_db_session)):
    pages = db.query(Page).options(
        joinedload(Page.images)
    ).offset(skip).limit(limit).all()
    return pages

@app.get("/pages/{page_id}/images", response_model=List[ImageResponse])
def get_images_by_page(page_id: int, db: Session = Depends(get_db_session)):
    page = db.query(Page).options(
        joinedload(Page.images)
    ).filter(Page.id == page_id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page.images

@app.get("/images/{image_id}/pages", response_model=List[PageResponse])
def get_pages_by_image(image_id: int, db: Session = Depends(get_db_session)):
    image = db.query(Image).options(
        joinedload(Image.pages)
    ).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return image.pages

@app.put("/images/{image_id}")
def update_image(image_id: int, request: ImageUpdateRequest, db: Session = Depends(get_db_session)):
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    image.status = request.status
    db.commit()
    db.refresh(image)
    return image

@app.get("/images/count")
def get_image_count(db: Session = Depends(get_db_session)):
    count = db.query(Image).count()
    return {"count": count}

@app.get("/pages/count")
def get_page_count(db: Session = Depends(get_db_session)):
    count = db.query(Page).count()
    return {"count": count}

@app.post("/delete-all")
def delete_all_data(db: Session = Depends(get_db_session)):
    try:
        db.execute('DELETE FROM image_page_relations')
        db.execute('DELETE FROM images')
        db.execute('DELETE FROM pages')
        db.commit()
        return {"message": "全データを削除しました"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"削除に失敗しました: {str(e)}") 