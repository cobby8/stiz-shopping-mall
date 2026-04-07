/**
 * 파일 업로드 미들웨어
 * 비유: 택배 접수 창구 — 파일 크기·종류를 검사하고, 지정된 폴더에 정리해서 보관
 *
 * multer 라이브러리를 사용하여:
 * 1. 저장 위치(destination)와 파일명(filename) 규칙을 설정
 * 2. 허용할 파일 확장자를 필터링
 * 3. 최대 파일 크기를 제한
 */
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// __dirname 대체 — ESM 환경에서는 __dirname이 없으므로 직접 만든다
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 업로드 루트 경로: server/uploads/
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

/**
 * 저장소 설정 — 파일이 어디에, 어떤 이름으로 저장될지 결정
 * req.uploadDir: 라우트에서 설정한 하위 폴더 (designs/references/temp)
 * req.uploadPrefix: 파일명 접두사 (design/ref/tmp)
 */
const storage = multer.diskStorage({
  // 저장 폴더 결정
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, req.uploadDir || 'temp');
    cb(null, dir);
  },
  // 파일명 규칙: prefix-타임스탬프-랜덤6자리.확장자
  // 예: design-1712400000000-a3f2c1.png
  filename: (req, file, cb) => {
    const prefix = req.uploadPrefix || 'file';
    const timestamp = Date.now();
    const random = crypto.randomBytes(3).toString('hex'); // 6자리 랜덤 문자
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${prefix}-${timestamp}-${random}${ext}`);
  }
});

/**
 * 이미지 필터 — 고객 레퍼런스용
 * jpg, jpeg, png, gif, webp, pdf만 허용
 */
const IMAGE_TYPES = /\.(jpe?g|png|gif|webp|pdf)$/i;

export function imageFilter(req, file, cb) {
  if (IMAGE_TYPES.test(file.originalname)) {
    cb(null, true); // 통과
  } else {
    cb(new Error('허용되지 않는 파일 형식입니다. (jpg, png, gif, webp, pdf만 가능)'), false);
  }
}

/**
 * 디자인 필터 — 관리자 시안 업로드용
 * 이미지 + ai, psd, svg 추가 허용
 */
const DESIGN_TYPES = /\.(jpe?g|png|gif|webp|pdf|ai|psd|svg)$/i;

export function designFilter(req, file, cb) {
  if (DESIGN_TYPES.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('허용되지 않는 파일 형식입니다. (jpg, png, gif, webp, pdf, ai, psd, svg만 가능)'), false);
  }
}

/**
 * multer 인스턴스 생성 함수
 * @param {Object} options - { fileFilter, limits }
 * @returns multer 인스턴스
 */
export function createUpload(options = {}) {
  return multer({
    storage,
    fileFilter: options.fileFilter || imageFilter,
    limits: {
      fileSize: options.maxSize || 10 * 1024 * 1024 // 기본 10MB
    }
  });
}

export { UPLOAD_ROOT };
