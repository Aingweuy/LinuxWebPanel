/**
 * CSV/TSV to .bytes Binary Converter
 * 
 * Ports the binary serialization format from DNMTableConverter (C#)
 * to JavaScript for use in the LinuxWebPanel CSV editor.
 * 
 * Binary Format (version 2):
 *   Stream 1 (Header):
 *     [int32 totalSize] [int32 recordCount]
 *     [bool hasStringSeq]
 *     [pool: strings] [pool: ints] [pool: uints] [pool: longs] [pool: floats] [pool: doubles]
 *     [int32 indexBufferCount] [int32[] indexBuffer]
 *   Stream 2 (Body):
 *     [byte colCount] [colDefs: (byte fieldType, byte dataType) * colCount]
 *     [rows: (int32 rowByteSize, col1, col2, ...) * recordCount]
 *   Output = Stream1 + Stream2
 *
 * Reference: C:\PersonalProjects\DNMTableConverter\CVSData.cs
 */

const csvBytesConverter = (function() {
    'use strict';

    var VERSION = 2;

    // ── ETableFieldType enum (CVSData.ETableFieldType) ──────────────────
    var EFieldType = { EValue: 0, EArray: 1, ESeq: 2, ESeqList: 3, ENum: 4 };

    // ── ETableParseType / dataType IDs (CVSData.ETableParseType) ────────
    var EDataType = {
        FLOAT:  0,   // float   → writeFloat32
        DOUBLE: 1,   // double  → writeFloat64
        UINT:   2,   // uint    → writeUInt32
        INT:    3,   // int     → writeInt32
        LONG:   4,   // long    → writeInt64
        STRING: 5,   // string  → pool index (int32)
        BOOL:   6,   // bool    → writeByte(0/1)
        BYTE:   7,   // byte    → writeByte
        SHORT:  8,   // short   → writeInt16
        NUM:    255
    };

    // ════════════════════════════════════════════════════════════════════
    //  XHash — exact port of C# KeyParse.XHash
    //  hash = (hash << 5) + hash + charCode   (unsigned 32-bit)
    // ════════════════════════════════════════════════════════════════════
    function xHash(str) {
        if (!str || str.length === 0) return 0;
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
        }
        return hash;
    }

    // ════════════════════════════════════════════════════════════════════
    //  BinaryWriter — growable little-endian writer matching C# BinaryWriter
    //  Tracks `_maxPos` so seek-back + patch doesn't lose written data.
    // ════════════════════════════════════════════════════════════════════
    function BinaryWriter(initialCapacity) {
        this.capacity = initialCapacity || 4096;
        this.buffer = new ArrayBuffer(this.capacity);
        this.view = new DataView(this.buffer);
        this.pos = 0;
        this._maxPos = 0;    // high-water mark of bytes written
    }

    BinaryWriter.prototype._ensure = function(bytesNeeded) {
        while (this.pos + bytesNeeded > this.capacity) {
            this.capacity *= 2;
            var newBuf = new ArrayBuffer(this.capacity);
            new Uint8Array(newBuf).set(new Uint8Array(this.buffer));
            this.buffer = newBuf;
            this.view = new DataView(this.buffer);
        }
    };

    BinaryWriter.prototype._advance = function(n) {
        this.pos += n;
        if (this.pos > this._maxPos) this._maxPos = this.pos;
    };

    BinaryWriter.prototype.writeInt32 = function(val) {
        this._ensure(4);
        this.view.setInt32(this.pos, val | 0, true);
        this._advance(4);
    };

    BinaryWriter.prototype.writeUInt32 = function(val) {
        this._ensure(4);
        this.view.setUint32(this.pos, val >>> 0, true);
        this._advance(4);
    };

    BinaryWriter.prototype.writeInt16 = function(val) {
        this._ensure(2);
        this.view.setInt16(this.pos, val | 0, true);
        this._advance(2);
    };

    BinaryWriter.prototype.writeFloat32 = function(val) {
        this._ensure(4);
        this.view.setFloat32(this.pos, +val, true);
        this._advance(4);
    };

    BinaryWriter.prototype.writeFloat64 = function(val) {
        this._ensure(8);
        this.view.setFloat64(this.pos, +val, true);
        this._advance(8);
    };

    // C# BinaryWriter.Write(long) — little-endian 8 bytes
    BinaryWriter.prototype.writeInt64 = function(val) {
        this._ensure(8);
        // Use BigInt when available for exact 64-bit two's complement
        if (typeof BigInt !== 'undefined') {
            var big = BigInt(val);
            var mask32 = BigInt(0xFFFFFFFF);
            var lo = Number(big & mask32);
            var hi = Number((big >> BigInt(32)) & mask32);
            this.view.setUint32(this.pos, lo, true);
            this.view.setUint32(this.pos + 4, hi, true);
        } else {
            // Fallback: manual split for safe-integer range
            var isNeg = val < 0;
            var abs = isNeg ? -val : val;
            var lo = abs % 0x100000000;
            var hi = Math.floor(abs / 0x100000000);
            if (isNeg) {
                // Two's complement: invert all bits, add 1
                lo = ((~lo) + 1) >>> 0;
                hi = (~hi + (lo === 0 ? 1 : 0)) >>> 0;
            }
            this.view.setUint32(this.pos, lo, true);
            this.view.setUint32(this.pos + 4, hi, true);
        }
        this._advance(8);
    };

    BinaryWriter.prototype.writeByte = function(val) {
        this._ensure(1);
        this.view.setUint8(this.pos, val & 0xFF);
        this._advance(1);
    };

    // C# BinaryWriter.Write(bool) — 1 byte, 0x01 or 0x00
    BinaryWriter.prototype.writeBool = function(val) {
        this.writeByte(val ? 1 : 0);
    };

    // C# BinaryWriter.Write(string):
    //   7-bit encoded integer length prefix, then UTF-8 bytes
    BinaryWriter.prototype.writeString = function(str) {
        if (str === null || str === undefined) str = '';
        // Encode to UTF-8
        var utf8Bytes = [];
        for (var i = 0; i < str.length; i++) {
            var code = str.charCodeAt(i);
            if (code < 0x80) {
                utf8Bytes.push(code);
            } else if (code < 0x800) {
                utf8Bytes.push(0xC0 | (code >> 6));
                utf8Bytes.push(0x80 | (code & 0x3F));
            } else if (code >= 0xD800 && code <= 0xDBFF) {
                // Surrogate pair
                i++;
                var low = str.charCodeAt(i);
                var codePoint = ((code - 0xD800) << 10) + (low - 0xDC00) + 0x10000;
                utf8Bytes.push(0xF0 | (codePoint >> 18));
                utf8Bytes.push(0x80 | ((codePoint >> 12) & 0x3F));
                utf8Bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
                utf8Bytes.push(0x80 | (codePoint & 0x3F));
            } else {
                utf8Bytes.push(0xE0 | (code >> 12));
                utf8Bytes.push(0x80 | ((code >> 6) & 0x3F));
                utf8Bytes.push(0x80 | (code & 0x3F));
            }
        }
        var len = utf8Bytes.length;
        // Write 7-bit encoded length (matches C# BinaryWriter)
        this._write7BitEncodedInt(len);
        this._ensure(len);
        for (var j = 0; j < len; j++) {
            this.view.setUint8(this.pos + j, utf8Bytes[j]);
        }
        this._advance(len);
    };

    BinaryWriter.prototype._write7BitEncodedInt = function(value) {
        value = value >>> 0; // unsigned
        while (value >= 0x80) {
            this.writeByte((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        this.writeByte(value & 0x7F);
    };

    BinaryWriter.prototype.seek = function(position) {
        this.pos = position;
    };

    BinaryWriter.prototype.getPosition = function() {
        return this.pos;
    };

    // Returns bytes [0 .. _maxPos) — safe even after seek-back patching
    BinaryWriter.prototype.toUint8Array = function() {
        return new Uint8Array(this.buffer, 0, this._maxPos);
    };

    BinaryWriter.prototype.getLength = function() {
        return this._maxPos;
    };

    // ════════════════════════════════════════════════════════════════════
    //  DataPool — hash-deduped value pool (mirrors DataHandler.DataInfo<T>)
    //
    //  C# behaviour: Clear() seeds pool with 4 default(T) entries and
    //  registers hash=0 → index 0.  WriteDataHead writes count=0 when
    //  pool.Count == 4 (i.e. nothing was actually added).
    // ════════════════════════════════════════════════════════════════════
    function DataPool(defaultValue) {
        this.pool = [];
        this.dataMap = {};   // hash(uint32) → { index, count }
        this._default = (defaultValue !== undefined) ? defaultValue : null;
        // Seed 4 defaults (matches C# DataInfo<T>.Clear)
        for (var i = 0; i < 4; i++) this.pool.push(this._default);
        this.dataMap[0] = { index: 0, count: 0 };
    }

    // Mirrors DataHandler.Add<T>
    DataPool.prototype.add = function(values, count, hash, writer, writeIndex, indexBuffer) {
        var key = hash >>> 0;   // ensure unsigned
        var info = this.dataMap[key];
        if (!info) {
            info = { index: this.pool.length, count: 0 };
            this.dataMap[key] = info;
            for (var i = 0; i < count; i++) {
                this.pool.push(values[i]);
            }
        }
        info.count++;
        if (writeIndex) {
            writer.writeInt32(info.index);
        } else if (indexBuffer) {
            indexBuffer.push(info.index);
        }
        return info.index;
    };

    // C#: if pool.Count == 4 → write 0 (nothing added beyond defaults)
    DataPool.prototype.getCount = function() {
        return this.pool.length === 4 ? 0 : this.pool.length;
    };

    // ════════════════════════════════════════════════════════════════════
    //  DataHandler — manages all six typed pools + indexBuffer
    //  Mirrors CVSData.DataHandler
    // ════════════════════════════════════════════════════════════════════
    function DataHandler() {
        this.clear();
    }

    DataHandler.prototype.clear = function() {
        this.hasStringSeq = false;
        this.strings = new DataPool('');
        this.ints    = new DataPool(0);
        this.uints   = new DataPool(0);
        this.longs   = new DataPool(0);
        this.floats  = new DataPool(0);
        this.doubles = new DataPool(0);
        this.indexBuffer = [];
    };

    // C# StringParse.Write with dh != null:
    //   hash = XHash(data); buffer[0] = data; dh.Add<string>(buffer, 1, hash, stream, true)
    DataHandler.prototype.addString = function(value, writer) {
        var s = (value === null || value === undefined) ? '' : value;
        var hash = xHash(s);
        this.strings.add([s], 1, hash, writer, true, this.indexBuffer);
    };

    // C# DataHandler.WriteHead — writes all pools to header stream
    DataHandler.prototype.writeHead = function(writer) {
        // 1. bool hasStringSeq
        writer.writeBool(this.hasStringSeq);

        // 2. Six pools in order: string, int, uint, long, float, double
        this._writeStringPool(writer, this.strings);
        this._writeTypedPool(writer, this.ints, 'writeInt32');
        this._writeTypedPool(writer, this.uints, 'writeUInt32');
        this._writeTypedPool(writer, this.longs, 'writeInt64');
        this._writeTypedPool(writer, this.floats, 'writeFloat32');
        this._writeTypedPool(writer, this.doubles, 'writeFloat64');

        // 3. Index buffer
        var ibLen = this.indexBuffer.length;
        writer.writeInt32(ibLen);
        for (var i = 0; i < ibLen; i++) {
            writer.writeInt32(this.indexBuffer[i]);
        }
    };

    DataHandler.prototype._writeStringPool = function(writer, pool) {
        var count = pool.getCount();
        writer.writeInt32(count);
        for (var i = 0; i < count; i++) {
            var s = pool.pool[i];
            writer.writeString((s === null || s === undefined) ? '' : s);
        }
    };

    DataHandler.prototype._writeTypedPool = function(writer, pool, writeMethod) {
        var count = pool.getCount();
        writer.writeInt32(count);
        for (var i = 0; i < count; i++) {
            var v = pool.pool[i];
            writer[writeMethod]((v === null || v === undefined) ? 0 : v);
        }
    };

    // ════════════════════════════════════════════════════════════════════
    //  Type Inference — scans column values to pick the best data type
    // ════════════════════════════════════════════════════════════════════
    function inferColumnType(values) {
        if (!values || values.length === 0) return EDataType.STRING;

        var hasBool = true, hasInt = true, hasFloat = true, nonEmpty = 0;

        for (var i = 0; i < values.length; i++) {
            var v = (values[i] || '').trim();
            if (v === '') continue;
            nonEmpty++;

            var vl = v.toLowerCase();
            if (vl !== 'true' && vl !== 'false' && v !== '0' && v !== '1') hasBool = false;
            if (hasInt && !/^-?\d+$/.test(v)) hasInt = false;
            if (hasFloat && !/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) hasFloat = false;
        }

        if (nonEmpty === 0) return EDataType.STRING;
        if (hasBool && !hasFloat) return EDataType.BOOL;
        if (hasInt) {
            // Range check: int32 [-2147483648, 2147483647] or long
            for (var j = 0; j < values.length; j++) {
                var n = parseInt((values[j] || '').trim(), 10);
                if (!isNaN(n) && (n > 2147483647 || n < -2147483648)) return EDataType.LONG;
            }
            return EDataType.INT;
        }
        if (hasFloat) return EDataType.FLOAT;
        return EDataType.STRING;
    }

    // ════════════════════════════════════════════════════════════════════
    //  Cell-value writers — match the C# ValueParse.Write(stream, data, dh)
    //  for each data type's EValue case.
    // ════════════════════════════════════════════════════════════════════
    function writeCellValue(writer, dataHandler, cellStr, dataType) {
        var v = (cellStr || '').trim();

        switch (dataType) {
            case EDataType.INT:
                // C# IntParse.Write: stream.Write((int)value)
                writer.writeInt32(v === '' ? 0 : (parseInt(v, 10) || 0));
                break;

            case EDataType.UINT:
                // C# UIntParse.Write: stream.Write((uint)value)
                writer.writeUInt32(v === '' ? 0 : (parseInt(v, 10) >>> 0));
                break;

            case EDataType.LONG:
                // C# LongParse.Write: stream.Write((long)value)
                writer.writeInt64(v === '' ? 0 : (parseInt(v, 10) || 0));
                break;

            case EDataType.FLOAT:
                // C# FloatParse.Write: stream.Write((float)value)
                writer.writeFloat32(v === '' ? 0 : (parseFloat(v) || 0));
                break;

            case EDataType.DOUBLE:
                // C# DoubleParse.Write: stream.Write((double)value)
                writer.writeFloat64(v === '' ? 0 : (parseFloat(v) || 0));
                break;

            case EDataType.STRING:
                // C# StringParse.Write: dh.Add<string>(buffer, 1, hash, stream, true)
                // Writes pool index to row stream; string goes into string pool
                dataHandler.addString(v, writer);
                break;

            case EDataType.BOOL:
                // C# BoolParse.Write: stream.Write(bool)
                var boolVal = false;
                if (v !== '') {
                    var vl = v.toLowerCase();
                    boolVal = (vl === 'true' || v === '1');
                }
                writer.writeBool(boolVal);
                break;

            case EDataType.BYTE:
                // C# ByteParse.Write: stream.Write((byte)value)
                writer.writeByte(v === '' ? 0 : (parseInt(v, 10) || 0));
                break;

            case EDataType.SHORT:
                // C# ShortParse.Write: stream.Write((short)value)
                writer.writeInt16(v === '' ? 0 : (parseInt(v, 10) || 0));
                break;

            default:
                // Fallback: treat as string
                dataHandler.addString(v, writer);
                break;
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //  generateBytes — main entry point
    //
    //  C# WriteFile flow (CVSData.cs line ~832):
    //    headerWriter  (binaryWriter)  = [totalSize][recordCount] ... [pools]
    //    bodyWriter    (binaryWriter2) = [colCount][colDefs][rows]
    //    output = headerWriter.bytes + bodyWriter.bytes
    // ════════════════════════════════════════════════════════════════════
    function generateBytes(headerRow, dataRows, columnTypes) {
        var colCount = headerRow.length;
        var recordCount = dataRows.length;
        var dataHandler = new DataHandler();

        // ── Stream 1: Header ────────────────────────────────────────────
        var headerWriter = new BinaryWriter(4096);

        // Placeholders (patched after pools are written)
        headerWriter.writeInt32(0);    // [0..3]  totalSize
        headerWriter.writeInt32(0);    // [4..7]  recordCount

        // ── Stream 2: Body ──────────────────────────────────────────────
        var bodyWriter = new BinaryWriter(Math.max(4096, recordCount * colCount * 8));

        // C# OnHeaderLine → binaryWriter2.Write((byte)colCount)
        bodyWriter.writeByte(colCount & 0xFF);

        // Column definitions: (byte fieldType, byte dataType) per column
        // C#: binaryWriter2.Write((byte)tfi.tableFieldType); binaryWriter2.Write(tfi.dataType);
        for (var c = 0; c < colCount; c++) {
            bodyWriter.writeByte(EFieldType.EValue);   // fieldType
            bodyWriter.writeByte(columnTypes[c]);       // dataType
        }

        // Write rows
        // C# WriteLine (version > 1): write int placeholder, write columns, patch size
        for (var r = 0; r < recordCount; r++) {
            var row = dataRows[r];

            // Row size placeholder
            var rowSizePos = bodyWriter.getPosition();
            bodyWriter.writeInt32(0);

            var rowDataStart = bodyWriter.getPosition();

            for (var col = 0; col < colCount; col++) {
                var cell = (col < row.length) ? row[col] : '';
                writeCellValue(bodyWriter, dataHandler, cell, columnTypes[col]);
            }

            // Patch row byte size (bytes after the size field)
            var rowDataEnd = bodyWriter.getPosition();
            var rowByteSize = rowDataEnd - rowDataStart;
            bodyWriter.seek(rowSizePos);
            bodyWriter.writeInt32(rowByteSize);
            bodyWriter.seek(rowDataEnd);
        }

        // ── Write pools into header stream ──────────────────────────────
        // C#: this.dataHandler.WriteHead(binaryWriter);
        dataHandler.writeHead(headerWriter);

        // ── Patch totalSize and recordCount ──────────────────────────────
        // C#: num = binaryWriter.BaseStream.Position + binaryWriter2.BaseStream.Position
        var headerLen = headerWriter.getLength();
        var bodyLen = bodyWriter.getLength();
        var totalSize = headerLen + bodyLen;

        headerWriter.seek(0);
        headerWriter.writeInt32(totalSize);    // patch totalSize
        headerWriter.writeInt32(recordCount);  // patch recordCount

        // ── Concatenate headerStream + bodyStream ───────────────────────
        var headerBytes = headerWriter.toUint8Array(); // uses _maxPos, safe after seek
        var bodyBytes = bodyWriter.toUint8Array();
        var result = new Uint8Array(headerLen + bodyLen);
        result.set(headerBytes, 0);
        result.set(bodyBytes, headerLen);

        return result;
    }

    // ════════════════════════════════════════════════════════════════════
    //  convertTableToBytes — convenience wrapper
    // ════════════════════════════════════════════════════════════════════
    function convertTableToBytes(tableData, options) {
        options = options || {};

        if (!tableData || tableData.length < 2) {
            throw new Error('Table must have at least a header row and one data row');
        }

        var headerRow = tableData[0];
        var startRow = options.skipSecondRow ? 2 : 1;
        var dataRows = tableData.slice(startRow);

        if (dataRows.length === 0) {
            throw new Error('No data rows to convert');
        }

        // Determine column types
        var columnTypes = options.columnTypes;
        if (!columnTypes) {
            columnTypes = [];
            for (var c = 0; c < headerRow.length; c++) {
                var colValues = [];
                for (var r = 0; r < dataRows.length; r++) {
                    if (c < dataRows[r].length) colValues.push(dataRows[r][c]);
                }
                columnTypes.push(inferColumnType(colValues));
            }
        }

        return generateBytes(headerRow, dataRows, columnTypes);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Base64 encoding
    // ════════════════════════════════════════════════════════════════════
    function uint8ArrayToBase64(uint8Array) {
        // Process in chunks to avoid call-stack limits on large files
        var chunks = [];
        var chunkSize = 8192;
        for (var i = 0; i < uint8Array.length; i += chunkSize) {
            var slice = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
            var binary = '';
            for (var j = 0; j < slice.length; j++) {
                binary += String.fromCharCode(slice[j]);
            }
            chunks.push(binary);
        }
        return btoa(chunks.join(''));
    }

    // ════════════════════════════════════════════════════════════════════
    //  Public API
    // ════════════════════════════════════════════════════════════════════
    return {
        VERSION: VERSION,
        EFieldType: EFieldType,
        EDataType: EDataType,
        xHash: xHash,
        BinaryWriter: BinaryWriter,
        DataHandler: DataHandler,
        DataPool: DataPool,
        inferColumnType: inferColumnType,
        generateBytes: generateBytes,
        convertTableToBytes: convertTableToBytes,
        uint8ArrayToBase64: uint8ArrayToBase64,

        getTypeName: function(dataType) {
            var names = {};
            names[EDataType.FLOAT]  = 'float';
            names[EDataType.DOUBLE] = 'double';
            names[EDataType.UINT]   = 'uint';
            names[EDataType.INT]    = 'int';
            names[EDataType.LONG]   = 'long';
            names[EDataType.STRING] = 'string';
            names[EDataType.BOOL]   = 'bool';
            names[EDataType.BYTE]   = 'byte';
            names[EDataType.SHORT]  = 'short';
            return names[dataType] || 'unknown';
        },

        parseTypeName: function(name) {
            var map = {
                'float': EDataType.FLOAT, 'double': EDataType.DOUBLE,
                'uint': EDataType.UINT, 'int': EDataType.INT,
                'long': EDataType.LONG, 'string': EDataType.STRING,
                'bool': EDataType.BOOL, 'byte': EDataType.BYTE,
                'short': EDataType.SHORT
            };
            return map[(name || '').toLowerCase()] !== undefined
                ? map[(name || '').toLowerCase()]
                : EDataType.STRING;
        }
    };
})();
