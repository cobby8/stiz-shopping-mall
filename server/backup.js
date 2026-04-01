/**
 * 데이터 자동 백업 시스템
 *
 * 비유: 중요 서류를 정기적으로 복사해서 금고에 보관하는 시스템.
 * 원본(data/*.json)이 손상되면 금고(data/backups/)에서 꺼내 복원할 수 있다.
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

// 백업 대상 파일 목록
const BACKUP_TARGETS = [
    'orders.json',
    'customers.json',
    'users.json',
    'order-history.json'
];

// 백업 설정
const DATA_DIR = path.join(__dirname, 'data');              // 원본 데이터 폴더
const BACKUP_DIR = path.join(__dirname, 'data', 'backups'); // 백업 저장 폴더
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
 * 예: 2026-03-31_143000
 */
function getTimestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd}_${HH}${mm}${ss}`;
}

/**
 * 단일 파일 백업 실행
 * 비유: 서류 한 장을 복사기에 넣고 복사본을 금고에 넣는 것
 *
 * @param {string} filename - 백업할 파일명 (예: orders.json)
 * @param {string} timestamp - 백업 시각 문자열
 * @returns {string|null} 백업된 파일명 또는 null (원본이 없는 경우)
 */
async function backupFile(filename, timestamp) {
    const sourcePath = path.join(DATA_DIR, filename);
    const backupName = `${timestamp}_${filename}`;
    const destPath = path.join(BACKUP_DIR, backupName);

    try {
        // 원본 파일이 존재하는지 확인
        await fs.access(sourcePath);
        // 비동기로 파일 복사 (서버 성능에 영향 최소화)
        await fs.copyFile(sourcePath, destPath);
        return backupName;
    } catch {
        // 원본 파일이 없으면 건너뛰기 (아직 생성되지 않은 파일일 수 있음)
        return null;
    }
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
 * 대상 파일 모두 백업 + 오래된 파일 정리
 *
 * @returns {{ success: boolean, files: string[], timestamp: string }}
 */
export async function runBackup() {
    const timestamp = getTimestamp();
    const backedUpFiles = [];

    try {
        // 1) 백업 폴더 확인/생성
        await ensureBackupDir();

        // 2) 각 파일을 순차적으로 백업 (비동기지만 순서대로 진행)
        for (const filename of BACKUP_TARGETS) {
            const result = await backupFile(filename, timestamp);
            if (result) {
                backedUpFiles.push(result);
            }
        }

        // 3) 오래된 백업 파일 정리
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
