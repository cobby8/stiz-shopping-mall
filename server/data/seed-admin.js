/**
 * 관리자 계정 초기 시드 스크립트
 * 비유: 건물 최초 입주 시 "마스터 키"를 만드는 작업
 *
 * 사용법: node server/data/seed-admin.js
 * - 이미 관리자 계정이 있으면 건너뜀 (중복 생성 방지)
 * - 비밀번호는 bcrypt로 해싱하여 저장
 */

import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_FILE = path.join(__dirname, 'users.json');

// 생성할 관리자 계정 목록
const ADMIN_ACCOUNTS = [
    {
        name: '관리자',
        email: 'admin@stiz.co.kr',
        password: 'stiz2026!',       // 초기 비밀번호 (로그인 후 변경 권장)
        role: 'admin'
    }
];

async function seedAdmin() {
    console.log('\n=== STIZ 관리자 계정 시드 스크립트 ===\n');

    // 기존 사용자 데이터 로드
    let users = [];
    if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        users = JSON.parse(data);
    }

    let created = 0;
    let skipped = 0;

    for (const admin of ADMIN_ACCOUNTS) {
        // 이미 같은 이메일의 계정이 있는지 확인
        const existing = users.find(u => u.email === admin.email);

        if (existing) {
            // 이미 있으면 role만 admin으로 업데이트 (비밀번호는 건드리지 않음)
            if (existing.role !== 'admin') {
                existing.role = 'admin';
                console.log(`  [업데이트] ${admin.email} → role을 admin으로 변경`);
                created++;
            } else {
                console.log(`  [건너뜀] ${admin.email} - 이미 관리자 계정 존재`);
                skipped++;
            }
            continue;
        }

        // 비밀번호 해싱
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(admin.password, salt);

        // 새 관리자 계정 추가
        users.push({
            id: Date.now() + created,       // 유니크 ID
            name: admin.name,
            email: admin.email,
            password: hashedPassword,
            role: 'admin',
            joinedAt: new Date().toISOString()
        });

        console.log(`  [생성됨] ${admin.email} (비밀번호: ${admin.password})`);
        created++;
    }

    // 파일에 저장
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');

    console.log(`\n결과: ${created}개 생성/업데이트, ${skipped}개 건너뜀`);
    console.log(`저장 위치: ${USERS_FILE}`);
    console.log('\n관리자 로그인 정보:');
    ADMIN_ACCOUNTS.forEach(a => {
        console.log(`  이메일: ${a.email}`);
        console.log(`  비밀번호: ${a.password}`);
    });
    console.log('\n(보안을 위해 로그인 후 비밀번호를 변경하세요)\n');
}

seedAdmin().catch(err => {
    console.error('시드 스크립트 실패:', err);
    process.exit(1);
});
