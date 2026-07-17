/**
 * Verification script — tests csvBytesConverter output against
 * the expected binary layout of CVSData.cs (DNMTableConverter).
 * 
 * Run: node verify-bytes-format.js
 */

// ── Load the converter (strip the `const` assignment wrapper) ───────
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const srcPath = path.join(__dirname, '..', 'BTPanel', 'static', 'js', 'csv-bytes-converter.js');
const src = fs.readFileSync(srcPath, 'utf8');
vm.runInThisContext(src, { filename: srcPath });

// ── Tiny binary reader (mirrors CVSReader.cs) ───────────────────────
class BinaryReader {
    constructor(buffer) {
        this.buf = Buffer.from(buffer);
        this.pos = 0;
    }
    readInt32()   { const v = this.buf.readInt32LE(this.pos);   this.pos += 4; return v; }
    readUInt32()  { const v = this.buf.readUInt32LE(this.pos);  this.pos += 4; return v; }
    readInt16()   { const v = this.buf.readInt16LE(this.pos);   this.pos += 2; return v; }
    readFloat()   { const v = this.buf.readFloatLE(this.pos);   this.pos += 4; return v; }
    readDouble()  { const v = this.buf.readDoubleLE(this.pos);  this.pos += 8; return v; }
    readBool()    { const v = this.buf.readUInt8(this.pos);     this.pos += 1; return v !== 0; }
    readByte()    { const v = this.buf.readUInt8(this.pos);     this.pos += 1; return v; }
    readInt64()   {
        const lo = this.buf.readUInt32LE(this.pos);
        const hi = this.buf.readInt32LE(this.pos + 4);
        this.pos += 8;
        return hi * 0x100000000 + lo;
    }
    read7BitEncodedInt() {
        let result = 0, shift = 0, b;
        do {
            b = this.readByte();
            result |= (b & 0x7F) << shift;
            shift += 7;
        } while (b >= 0x80);
        return result;
    }
    readString() {
        const len = this.read7BitEncodedInt();
        const bytes = this.buf.slice(this.pos, this.pos + len);
        this.pos += len;
        return bytes.toString('utf8');
    }
}

// ── Test 1: Simple table with mixed types ───────────────────────────
function test_simple_table() {
    console.log('=== Test 1: Simple mixed-type table ===');

    const table = [
        ['id', 'name', 'score', 'active'],   // header
        ['1',  'Alice', '95.5', 'true'],
        ['2',  'Bob',   '87.3', 'false'],
        ['3',  'Charlie', '100', 'true'],
    ];

    const columnTypes = [
        csvBytesConverter.EDataType.INT,
        csvBytesConverter.EDataType.STRING,
        csvBytesConverter.EDataType.FLOAT,
        csvBytesConverter.EDataType.BOOL,
    ];

    const bytes = csvBytesConverter.convertTableToBytes(table, { columnTypes });
    console.log('  Output size:', bytes.length, 'bytes');

    // Parse back
    const br = new BinaryReader(bytes);

    const totalSize = br.readInt32();
    const recordCount = br.readInt32();
    console.log('  totalSize:', totalSize, '(expected:', bytes.length, ')');
    console.log('  recordCount:', recordCount, '(expected: 3)');

    assert(totalSize === bytes.length, 'totalSize matches file length');
    assert(recordCount === 3, 'recordCount is 3');

    // Read pools (hasStringSeq + 6 pools + indexBuffer)
    const hasStringSeq = br.readBool();
    console.log('  hasStringSeq:', hasStringSeq);

    // String pool
    const strCount = br.readInt32();
    console.log('  String pool count:', strCount);
    const strings = [];
    for (let i = 0; i < strCount; i++) strings.push(br.readString());
    console.log('  Strings:', strings);

    // Int pool
    const intCount = br.readInt32();
    console.log('  Int pool count:', intCount, '(expected: 0 — ints not pooled for EValue)');
    for (let i = 0; i < intCount; i++) br.readInt32();

    // UInt pool
    const uintCount = br.readInt32();
    console.log('  UInt pool count:', uintCount, '(expected: 0)');
    for (let i = 0; i < uintCount; i++) br.readUInt32();

    // Long pool
    const longCount = br.readInt32();
    console.log('  Long pool count:', longCount, '(expected: 0)');
    for (let i = 0; i < longCount; i++) br.readInt64();

    // Float pool
    const floatCount = br.readInt32();
    console.log('  Float pool count:', floatCount, '(expected: 0 — floats not pooled for EValue)');
    for (let i = 0; i < floatCount; i++) br.readFloat();

    // Double pool
    const doubleCount = br.readInt32();
    console.log('  Double pool count:', doubleCount, '(expected: 0)');
    for (let i = 0; i < doubleCount; i++) br.readDouble();

    // Index buffer
    const ibCount = br.readInt32();
    console.log('  IndexBuffer count:', ibCount);
    for (let i = 0; i < ibCount; i++) br.readInt32();

    // ── Body stream starts here ──────────────────────────────────────
    const colCount = br.readByte();
    console.log('  colCount:', colCount, '(expected: 4)');
    assert(colCount === 4, 'colCount is 4');

    // Column defs
    for (let c = 0; c < colCount; c++) {
        const ftype = br.readByte();  // fieldType
        const dtype = br.readByte();  // dataType
        console.log(`  Col ${c}: fieldType=${ftype} dataType=${dtype} (${csvBytesConverter.getTypeName(dtype)})`);
    }

    // Rows
    const expectedRows = [
        { id: 1, name: 'Alice', score: 95.5, active: true },
        { id: 2, name: 'Bob', score: 87.3, active: false },
        { id: 3, name: 'Charlie', score: 100, active: true },
    ];

    for (let r = 0; r < recordCount; r++) {
        const rowSize = br.readInt32();  // row byte size
        const rowStart = br.pos;

        const id = br.readInt32();
        const nameIdx = br.readInt32();  // string pool index
        const score = br.readFloat();
        const active = br.readBool();

        const name = (nameIdx >= 0 && nameIdx < strings.length) ? strings[nameIdx] : '??';

        console.log(`  Row ${r}: id=${id} name="${name}"(idx=${nameIdx}) score=${score.toFixed(1)} active=${active}  rowSize=${rowSize}`);

        assert(id === expectedRows[r].id, `Row ${r} id`);
        assert(name === expectedRows[r].name, `Row ${r} name`);
        assert(Math.abs(score - expectedRows[r].score) < 0.01, `Row ${r} score`);
        assert(active === expectedRows[r].active, `Row ${r} active`);

        const actualRowBytes = br.pos - rowStart;
        assert(actualRowBytes === rowSize, `Row ${r} size: actual=${actualRowBytes} expected=${rowSize}`);
    }

    console.log('  ✓ Test 1 PASSED\n');
}

// ── Test 2: XHash compatibility ─────────────────────────────────────
function test_xhash() {
    console.log('=== Test 2: XHash compatibility ===');

    // C# XHash("Alice") step by step:
    //   hash=0
    //   'A'(65):  (0<<5)+0+65 = 65
    //   'l'(108): (65<<5)+65+108 = 2080+65+108 = 2253
    //   'i'(105): (2253<<5)+2253+105 = 72096+2253+105 = 74454
    //   'c'(99):  (74454<<5)+74454+99 = 2382528+74454+99 = 2457081
    //   'e'(101): (2457081<<5)+2457081+101 = 78626592+2457081+101 = 81083774

    const hash = csvBytesConverter.xHash('Alice');
    console.log('  xHash("Alice") =', hash, '(expected: 81083774)');
    assert(hash === 81083774, 'xHash("Alice") matches C#');

    // Empty string → 0
    assert(csvBytesConverter.xHash('') === 0, 'xHash("") is 0');
    assert(csvBytesConverter.xHash(null) === 0, 'xHash(null) is 0');

    console.log('  ✓ Test 2 PASSED\n');
}

// ── Test 3: String deduplication ────────────────────────────────────
function test_string_dedup() {
    console.log('=== Test 3: String deduplication ===');

    const table = [
        ['category'],
        ['fruit'],
        ['fruit'],    // duplicate
        ['vegetable'],
        ['fruit'],    // duplicate
    ];

    const bytes = csvBytesConverter.convertTableToBytes(table, {
        columnTypes: [csvBytesConverter.EDataType.STRING]
    });

    const br = new BinaryReader(bytes);
    br.readInt32(); // totalSize
    const recordCount = br.readInt32();
    assert(recordCount === 4, 'recordCount is 4');

    // Read pools
    br.readBool(); // hasStringSeq
    const strCount = br.readInt32();
    const strings = [];
    for (let i = 0; i < strCount; i++) strings.push(br.readString());

    // 4 defaults + "fruit" + "vegetable" = 6 entries
    // But "" at index 0 maps to hash=0 (the default)
    console.log('  String pool:', strings);
    console.log('  Pool size:', strCount, '— should be 6 (4 defaults + 2 unique)');

    // The pool should have: [null/'', null/'', null/'', null/'', 'fruit', 'vegetable']
    // So "fruit" is at index 4, "vegetable" at index 5
    assert(strings[4] === 'fruit', 'fruit at pool index 4');
    assert(strings[5] === 'vegetable', 'vegetable at pool index 5');

    // Skip remaining pools
    for (let p = 0; p < 5; p++) {
        const cnt = br.readInt32();
        for (let i = 0; i < cnt; i++) {
            if (p < 2) br.readInt32();
            else if (p === 2) { br.readInt32(); br.readInt32(); }
            else if (p === 3) br.readFloat();
            else br.readDouble();
        }
    }

    // Skip index buffer
    const ibCount = br.readInt32();
    for (let i = 0; i < ibCount; i++) br.readInt32();

    // Read column defs
    const colCount = br.readByte();
    br.readByte(); br.readByte(); // fieldType, dataType

    // Read rows — all "fruit" rows should have same pool index
    const indices = [];
    for (let r = 0; r < recordCount; r++) {
        br.readInt32(); // rowSize
        indices.push(br.readInt32()); // string pool index
    }

    console.log('  Row indices:', indices);
    assert(indices[0] === indices[1], 'fruit rows share same pool index');
    assert(indices[0] === indices[3], 'all fruit rows share same pool index');
    assert(indices[0] !== indices[2], 'vegetable has different index');

    console.log('  ✓ Test 3 PASSED\n');
}

// ── Test 4: Auto type inference ─────────────────────────────────────
function test_type_inference() {
    console.log('=== Test 4: Type inference ===');

    const INT = csvBytesConverter.EDataType.INT;
    const FLOAT = csvBytesConverter.EDataType.FLOAT;
    const STRING = csvBytesConverter.EDataType.STRING;
    const BOOL = csvBytesConverter.EDataType.BOOL;
    const LONG = csvBytesConverter.EDataType.LONG;

    assert(csvBytesConverter.inferColumnType(['1', '2', '3']) === INT, 'ints → INT');
    assert(csvBytesConverter.inferColumnType(['1.5', '2.3', '3.0']) === FLOAT, 'floats → FLOAT');
    assert(csvBytesConverter.inferColumnType(['hello', 'world']) === STRING, 'strings → STRING');
    assert(csvBytesConverter.inferColumnType(['true', 'false', 'true']) === BOOL, 'bools → BOOL');
    assert(csvBytesConverter.inferColumnType(['3000000000']) === LONG, 'large int → LONG');
    assert(csvBytesConverter.inferColumnType(['', '', '']) === STRING, 'all empty → STRING');

    console.log('  ✓ Test 4 PASSED\n');
}

// ── Assertions ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(condition, msg) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error('  ✗ ASSERTION FAILED:', msg);
    }
}

// ── Run ─────────────────────────────────────────────────────────────
try {
    test_xhash();
    test_simple_table();
    test_string_dedup();
    test_type_inference();

    console.log(`\n══════════════════════════════════`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log(`══════════════════════════════════`);
    process.exit(failed > 0 ? 1 : 0);
} catch (e) {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
}
