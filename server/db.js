/**
 * Simple JSON File Database
 * Reads/writes JSON files in ./data/ directory.
 * Suitable for MVP/prototyping. Replace with SQLite/MongoDB for production.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getFilePath(collection) {
    return path.join(DATA_DIR, `${collection}.json`);
}

// Read all records from a collection
export function getAll(collection) {
    const filePath = getFilePath(collection);
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
}

// Write all records to a collection
export function saveAll(collection, data) {
    const filePath = getFilePath(collection);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Add a record
export function insert(collection, record) {
    const data = getAll(collection);
    record.id = record.id || Date.now();
    data.push(record);
    saveAll(collection, data);
    return record;
}

// Find by field
export function findOne(collection, field, value) {
    const data = getAll(collection);
    return data.find(item => item[field] === value) || null;
}

// Find by ID
export function findById(collection, id) {
    return findOne(collection, 'id', id);
}

// Update a record by ID
export function updateById(collection, id, updates) {
    const data = getAll(collection);
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return null;
    data[index] = { ...data[index], ...updates };
    saveAll(collection, data);
    return data[index];
}

// Delete by ID
export function deleteById(collection, id) {
    const data = getAll(collection);
    const filtered = data.filter(item => item.id !== id);
    if (filtered.length === data.length) return false;
    saveAll(collection, filtered);
    return true;
}

export default { getAll, saveAll, insert, findOne, findById, updateById, deleteById };
