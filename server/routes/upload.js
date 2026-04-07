/**
 * 파일 업로드 라우트
 * 비유: 택배 접수 창구가 3개 — 고객용(레퍼런스), 관리자용(시안), 관리자용(임시)
 *
 * 엔드포인트:
 * - POST /api/upload/reference     — 고객 레퍼런스 업로드 (인증 불필요, 10MB)
 * - POST /api/admin/upload/design  — 관리자 시안 업로드 (인증 필요, 20MB)
 * - POST /api/admin/upload/temp    — 관리자 임시 업로드 (인증 필요, 10MB)
 */
import { Router } from 'express';
import { createUpload, imageFilter, designFilter } from '../middleware/upload.js';
import { adminAuth } from '../middleware/adminAuth.js'; // 관리자 인증 — design/temp 업로드에 필요

const router = Router();

// --- 고객용: 레퍼런스 이미지 업로드 ---
// 인증 없이 사용 가능 (주문 시 레퍼런스 첨부)
const referenceUpload = createUpload({
  fileFilter: imageFilter,
  maxSize: 10 * 1024 * 1024 // 10MB 제한
});

router.post('/upload/reference', (req, res, next) => {
  // 저장 폴더와 파일명 접두사를 미리 설정
  req.uploadDir = 'references';
  req.uploadPrefix = 'ref';
  next();
}, referenceUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '파일이 없습니다.' });
  }
  // 업로드 성공 — 클라이언트에 파일 경로 반환
  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      // URL 경로: /uploads/references/ref-xxx.png
      url: `/uploads/references/${req.file.filename}`
    }
  });
});

// --- 관리자용: 시안 업로드 ---
// adminAuth는 server.js에서 /api/admin 경로에 이미 적용됨
const designUpload = createUpload({
  fileFilter: designFilter,
  maxSize: 20 * 1024 * 1024 // 20MB 제한 (디자인 파일은 더 클 수 있음)
});

router.post('/admin/upload/design', adminAuth, (req, res, next) => {
  req.uploadDir = 'designs';
  req.uploadPrefix = 'design';
  next();
}, designUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '파일이 없습니다.' });
  }
  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      url: `/uploads/designs/${req.file.filename}`
    }
  });
});

// --- 관리자용: 임시 업로드 ---
// 용도: 관리자가 주문 관련 임시 파일을 올릴 때
const tempUpload = createUpload({
  fileFilter: imageFilter,
  maxSize: 10 * 1024 * 1024
});

router.post('/admin/upload/temp', adminAuth, (req, res, next) => {
  req.uploadDir = 'temp';
  req.uploadPrefix = 'tmp';
  next();
}, tempUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '파일이 없습니다.' });
  }
  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      url: `/uploads/temp/${req.file.filename}`
    }
  });
});

// --- multer 에러 처리 ---
// multer에서 발생하는 에러(파일 크기 초과, 형식 불일치 등)를 잡아서 친절한 메시지로 변환
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '파일 크기가 제한을 초과했습니다.' });
  }
  if (err.message && err.message.includes('허용되지 않는')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

export default router;
