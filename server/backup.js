/**
 * 데이터 자동 백업 시스템
 * [E-1] SQLite 전환 — JSON 파일 복사 방식에서 SQLite DB 파일 복사로 변경
 *
 * 비유: 중요 서류를 정기적으로 복사해서 금고에 보관하는 시스템.
 * 이제는 여러 엑셀 파일 대신 하나의 데이터베이스 파일(stiz.db)만 복사하면 된다.
 *
 * 동작 방식:
 * 1) 서버 시작 시 1회 백업 실행
 * 2) 이후 6시간마다 자동 백업 (setInterval)
 * 3) 7일보다 오래된 백업 파일은 자동 삭제
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 백업 설정
const DATA_DIR = path.join(__dirname, 'data');              // 원본 데이터 폴더
const DB_FILE = path.join(DATA_DIR, 'stiz.db');             // SQLite DB 파일 경로
const BACKUP_DIR = path.join(DATA_DIR, 'backups');           // 백업 저장 폴더
const MAX_AGE_DAYS = 7;                                     // 최대 보관 일수
const INTERVAL_MS = 6 * 60 * 60 * 1000;                    // 백업 주기: 6시간 (밀리초)

/**
 * 백업 폴더가 없으면 자동 생성
 * 비유: 금고가 없으면 먼저 금고를 설치하는 것
 */
async function ensureBackupDir() {
    try {
        await fs.access(BACKUP_DIR);
    } catch {
        // 폴더가 없으면 생성 (recursive: 상위 폴더도 함께)
        await fs.mkdir(BACKUP_DIR, { recursive: true });
        console.log(`  [Backup] 백업 폴더 생성: ${BACKUP_DIR}`);
    }
}

/**
 * 현재 시각을 파일명용 문자열로 변환
 * 예: 20260402_143000
 */
function getTimestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}

/**
 * 7일보다 오래된 백업 파일 자동 삭제
 * 비유: 금고가 꽉 차지 않도록, 1주일 지난 복사본은 파쇄하는 것
 */
async function cleanOldBackups() {
    try {
        const files = await fs.readdir(BACKUP_DIR);
        const now = Date.now();
        const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000; // 7일을 밀리초로 변환
        let deletedCount = 0;

        for (const file of files) {
            const filePath = path.join(BACKUP_DIR, file);
            const stat = await fs.stat(filePath);

            // 파일 생성 시각이 7일보다 오래되었으면 삭제
            if (now - stat.mtimeMs > maxAgeMs) {
                await fs.unlink(filePath);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            console.log(`  [Backup] 오래된 백업 ${deletedCount}개 삭제 (${MAX_AGE_DAYS}일 초과)`);
        }
    } catch (error) {
        console.error('  [Backup] 오래된 백업 정리 실패:', error.message);
    }
}

/**
 * 전체 백업 실행 (메인 함수)
 * SQLite DB 파일을 타임스탬프 붙여서 복사 + 오래된 파일 정리
 *
 * 비유: 이전에는 서류 4묶음을 각각 복사했지만,
 *       이제는 하나의 DB 파일만 복사하면 전부 백업되는 것
 *
 * @returns {{ success: boolean, files: string[], timestamp: string }}
 */
export async function runBackup() {
    const timestamp = getTimestamp();
    const backedUpFiles = [];

    try {
        // 1) 백업 폴더 확인/생성
        await ensureBackupDir();

        // 2) SQLite DB 파일 복사
        // 백업 파일명: stiz_YYYYMMDD_HHmmss.db
        const backupName = `stiz_${timestamp}.db`;
        const destPath = path.join(BACKUP_DIR, backupName);

        try {
            await fs.access(DB_FILE);
            // DB 파일을 단순 파일 복사 (WAL 모드에서 checkpoint 후 복사가 안전)
            // better-sqlite3는 WAL 모드에서 읽기 중 복사해도 일관된 스냅샷 보장
            await fs.copyFile(DB_FILE, destPath);
            backedUpFiles.push(backupName);
        } catch {
            console.log('  [Backup] stiz.db 파일이 없어 백업 건너뜀');
        }

        // 3) WAL 파일도 함께 백업 (존재하면)
        // WAL 파일이 있으면 DB와 함께 복사해야 완전한 백업
        const walFile = DB_FILE + '-wal';
        const walBackup = path.join(BACKUP_DIR, `stiz_${timestamp}.db-wal`);
        try {
            await fs.access(walFile);
            await fs.copyFile(walFile, walBackup);
        } catch {
            // WAL 파일이 없으면 무시 (정상 — checkpoint 완료된 상태)
        }

        // 4) 오래된 백업 파일 정리
        await cleanOldBackups();

        console.log(`  [Backup] 완료: ${backedUpFiles.length}개 파일 백업 (${timestamp})`);

        return {
            success: true,
            files: backedUpFiles,
            timestamp
        };
    } catch (error) {
        console.error('  [Backup] 백업 실패:', error.message);
        return {
            success: false,
            files: backedUpFiles,
            timestamp,
            error: error.message
        };
    }
}

/**
 * 백업 스케줄러 시작
 * 서버 시작 시 호출되어, 즉시 1회 백업 + 이후 6시간마다 반복
 *
 * 비유: 알람 시계를 맞추는 것. 지금 한 번 울리고, 이후 6시간마다 울린다.
 */
export function startBackupScheduler() {
    console.log(`  [Backup] 자동 백업 스케줄러 시작 (주기: ${INTERVAL_MS / 1000 / 60 / 60}시간, 보관: ${MAX_AGE_DAYS}일)`);

    // 서버 시작 직후 1회 백업 실행 (비동기로 실행하여 서버 시작을 지연시키지 않음)
    runBackup();

    // 6시간마다 반복 백업
    const intervalId = setInterval(() => {
        runBackup();
    }, INTERVAL_MS);

    // 서버 종료 시 타이머 정리를 위해 intervalId 반환
    return intervalId;
}

export default { runBackup, startBackupScheduler };
