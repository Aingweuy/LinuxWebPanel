/**
 * CSV Editor File Manager Integration
 * Extends existing file manager with CSV editing capabilities
 * Supports custom delimiters (comma, tab, space) and .txt files
 */

const csvFileManagerIntegration = {
    delimiter: ',',
    encoding: 'utf-8',
    quote_char: '"',
    delimiter_options: {
        'comma': ',',
        'tab': '\t',
        'space': ' ',
        'semicolon': ';',
        'pipe': '|'
    },
    supported_extensions: ['csv', 'txt', 'tsv'],
    
    /**
     * Initialize CSV file manager integration
     */
    init: function() {
        this.extend_file_manager();
        this.bind_file_events();
    },
    
    /**
     * Extend existing file manager with CSV support
     */
    extend_file_manager: function() {
        const that = this;
        
        // Hook into file manager's file context menu
        const original_render_menu = bt_file.render_file_groud_menu;
        
        if (typeof original_render_menu === 'function') {
            bt_file.render_file_groud_menu = function(ev, el) {
                // Call original function first to populate the DOM menu
                original_render_menu.call(this, ev, el);
                
                const index = $(el).data('index');
                const data = bt_file.file_list[index];
                
                // Add CSV edit option for supported file types
                if (that.is_csv_file(data.ext) || that.is_csv_file(data.filename)) {
                    const menu_ul = $('.selection_right_menu ul');
                    
                    // Prevent duplicate injections
                    menu_ul.find('li[data-id="edit_csv"]').remove();
                    
                    // Insert right after the Edit/Open item (which is usually the first item)
                    const open_item = menu_ul.find('li').first();
                    const csv_item = $(`
                        <li data-id="edit_csv">
                            <i class="file_menu_icon edit_file_icon"></i>
                            <span>Edit in CSV Editor</span>
                        </li>
                    `);
                    
                    csv_item.on('click', function(e) {
                        $('.selection_right_menu').removeAttr('style');
                        that.open_csv_editor(data);
                        e.stopPropagation();
                        e.preventDefault();
                    });
                    
                    if (open_item.length > 0) {
                        open_item.after(csv_item);
                    } else {
                        menu_ul.prepend(csv_item);
                    }
                }
            };
        }
        
        // Hook into file double-click to open CSV files in editor
        const original_file_groud_event = bt_file.file_groud_event;
        
        if (typeof original_file_groud_event === 'function') {
            bt_file.file_groud_event = function(data) {
                if (data.open === 'edit_csv') {
                    csvFileManagerIntegration.open_csv_editor(data);
                    return;
                }
                original_file_groud_event.call(this, data);
            };
        }
    },
    
    /**
     * Bind CSV file events
     */
    bind_file_events: function() {
        const that = this;
        
        // Context menu for CSV files
        $(document).on('contextmenu', '.file_list_content .file_tr', function(e) {
            const index = $(this).data('index');
            const data = bt_file.file_list[index];
            
            if (that.is_csv_file(data.ext) || that.is_csv_file(data.filename)) {
                that.show_csv_file_menu(e, data);
                e.preventDefault();
            }
        });
    },
    
    /**
     * Check if file is CSV-supported type
     */
    is_csv_file: function(filename_or_ext) {
        if (!filename_or_ext) return false;
        
        const ext = filename_or_ext.toLowerCase().split('.').pop();
        return this.supported_extensions.includes(ext);
    },
    
    /**
     * Show CSV-specific context menu for files
     */
    show_csv_file_menu: function(e, data) {
        const that = this;
        const x = e.clientX;
        const y = e.clientY;
        
        const menu_html = `
            <div class="csv_file_popup_menu ace_catalogue_menu" style="position: fixed; left: ${x}px; top: ${y}px; z-index: 99999;">
                <ul class="csv_menu_list">
                    <li class="csv_menu_item" data-action="open_csv_editor">
                        <i class="glyphicon glyphicon-edit"></i>
                        <span>Edit in CSV Editor</span>
                    </li>
                    <li class="csv_menu_item" data-action="open_text_editor">
                        <i class="glyphicon glyphicon-pencil"></i>
                        <span>Edit as Text</span>
                    </li>
                    <li class="csv_menu_divider"></li>
                    <li class="csv_menu_item" data-action="csv_settings">
                        <i class="glyphicon glyphicon-cog"></i>
                        <span>CSV Settings...</span>
                    </li>
                    <li class="csv_menu_divider"></li>
                    <li class="csv_menu_item" data-action="convert_format">
                        <i class="glyphicon glyphicon-random"></i>
                        <span>Convert Format...</span>
                    </li>
                </ul>
            </div>
        `;
        
        // Remove previous menu
        $('.csv_file_popup_menu').remove();
        
        // Add new menu
        $('body').append(menu_html);
        
        // Bind menu item click handlers
        $('.csv_file_popup_menu .csv_menu_item[data-action]').on('click', function() {
            const action = $(this).data('action');
            
            switch(action) {
                case 'open_csv_editor':
                    that.open_csv_editor(data);
                    break;
                case 'open_text_editor':
                    openEditorView(0, data.path);
                    break;
                case 'csv_settings':
                    that.show_csv_settings_dialog(data);
                    break;
                case 'convert_format':
                    that.show_convert_dialog(data);
                    break;
            }
            
            $('.csv_file_popup_menu').remove();
        });
        
        // Close menu on outside click
        $(document).one('click', function() {
            $('.csv_file_popup_menu').remove();
        });
    },
    
    /**
     * Open CSV editor view
     */
    open_csv_editor: function(data) {
        const that = this;
        
        // Show loading message
        const loadT = bt.load('Loading CSV file...');
        
        // Load file content
        bt.send('GetFileBody', 'files/GetFileBody', {
            filename: data.path
        }, function(res) {
            loadT.close();
            
            if (!res.status) {
                layer.msg('Failed to load file: ' + res.msg, { icon: 2 });
                return;
            }
            
            // Parse CSV content
            that.show_csv_editor_dialog(data, res.data);
        });
    },
    
    /**
     * Show CSV editor dialog
     */
    show_csv_editor_dialog: function(data, content) {
        const that = this;
        const delimiter_select = `
            <select class="csv_delimiter_select bt-input-text" style="width: 150px;">
                <option value="comma">Comma (,)</option>
                <option value="tab">Tab (\\t)</option>
                <option value="space">Space ( )</option>
                <option value="semicolon">Semicolon (;)</option>
                <option value="pipe">Pipe (|)</option>
            </select>
        `;
        
        const csv_table = this.parse_csv(content, this.delimiter);
        const table_html = this.generate_table_html(csv_table);
        
        layer.open({
            type: 1,
            title: 'CSV Editor - [ ' + data.filename + ' ]',
            area: ['95%', '90vh'],
            maxmin: true,
            shadeClose: false,
            closeBtn: 2,
            skin: 'csv_editor_view',
            content: `
                <div class="csv_editor_container" style="height: 100%; display: flex; flex-direction: column;">
                    <div class="csv_editor_toolbar pd10" style="border-bottom: 1px solid #ddd; background: #fafafa;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <span>Delimiter:</span>
                            ${delimiter_select}
                            <button class="btn btn-sm btn-default csv_refresh_btn">
                                <i class="glyphicon glyphicon-refresh"></i> Refresh
                            </button>
                            <button class="btn btn-sm btn-success csv_save_btn">
                                <i class="glyphicon glyphicon-save"></i> Save
                            </button>
                            <button class="btn btn-sm btn-info csv_export_btn">
                                <i class="glyphicon glyphicon-download"></i> Export
                            </button>
                            <div style="flex: 1;"></div>
                            <span style="font-size: 12px; color: #666;">
                                Rows: <span class="csv_row_count">0</span> | Columns: <span class="csv_col_count">0</span>
                            </span>
                        </div>
                    </div>
                    <div class="csv_editor_main pd10" style="flex: 1; overflow: auto;">
                        <div class="csv_table_wrapper">
                            ${table_html}
                        </div>
                    </div>
                </div>
            `,
            success: function(layero, index) {
                // Bind delimiter change
                $('.csv_delimiter_select').on('change', function() {
                    that.delimiter = that.delimiter_options[$(this).val()];
                    const new_table = that.parse_csv(content, that.delimiter);
                    const new_html = that.generate_table_html(new_table);
                    $('.csv_table_wrapper').html(new_html);
                    that.update_table_stats();
                    csvEditor.init();
                });
                
                // Bind refresh button
                $('.csv_refresh_btn').on('click', function() {
                    const new_table = that.parse_csv(content, that.delimiter);
                    const new_html = that.generate_table_html(new_table);
                    $('.csv_table_wrapper').html(new_html);
                    that.update_table_stats();
                    csvEditor.init();
                    layer.msg('Refreshed', { icon: 1 });
                });
                
                // Bind save button
                $('.csv_save_btn').on('click', function() {
                    that.save_csv_file(data, layero, index);
                });
                
                // Bind export button
                $('.csv_export_btn').on('click', function() {
                    that.show_export_options(data);
                });
                
                // Initialize CSV editor
                csvEditor.current_file = data.path;
                csvEditor.init();
                
                // Update statistics
                that.update_table_stats();
            },
            cancel: function(index, layero) {
                if (csvEditor.is_editing) {
                    const confirm_index = layer.confirm('You have unsaved changes. Are you sure you want to close?', {
                        icon: 3,
                        btn: ['Yes', 'No'],
                        closeBtn: 2
                    }, function() {
                        layer.close(confirm_index);
                        layer.close(index);
                        csvEditor.is_editing = false;
                    });
                    return false; // Prevent immediate close
                }
                csvEditor.is_editing = false;
            }
        });
    },
    
    /**
     * Parse CSV content based on delimiter
     */
    parse_csv: function(content, delimiter) {
        const lines = content.split('\n');
        const table = [];
        
        lines.forEach(line => {
            if (line.trim()) {
                const row = this.parse_csv_line(line, delimiter);
                table.push(row);
            }
        });
        
        return table;
    },
    
    /**
     * Parse single CSV line
     */
    parse_csv_line: function(line, delimiter) {
        const cells = [];
        let current_cell = '';
        let in_quotes = false;
        const quote = this.quote_char || '"';
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const next_char = line[i + 1];
            
            if (char === quote) {
                if (in_quotes && next_char === quote) {
                    current_cell += quote;
                    i++;
                } else {
                    in_quotes = !in_quotes;
                }
            } else if (char === delimiter && !in_quotes) {
                cells.push(current_cell.trim());
                current_cell = '';
            } else {
                current_cell += char;
            }
        }
        
        cells.push(current_cell.trim());
        return cells;
    },
    
    /**
     * Generate HTML table from parsed CSV
     */
    generate_table_html: function(csv_table) {
        if (csv_table.length === 0) return '<p>No data</p>';
        
        let html = '<table class="table csv_table" style="border-collapse: collapse; width: 100%;">';
        
        // Generate headers (first row)
        if (csv_table.length > 0) {
            html += '<thead><tr style="background-color: #f5f5f5;">';
            csv_table[0].forEach((cell, index) => {
                html += `<th style="border: 1px solid #ddd; padding: 10px; font-weight: bold; background-color: #f0f0f0;">
                    <input type="text" value="${this.escape_html(cell)}" class="csv_header_cell" style="width: 100%; border: none; background: transparent; padding: 4px; font-weight: bold;">
                </th>`;
            });
            html += '</tr></thead>';
        }
        
        // Generate body rows
        html += '<tbody>';
        for (let i = 1; i < csv_table.length; i++) {
            html += '<tr class="csv_row">';
            csv_table[i].forEach((cell, col_index) => {
                html += `<td class="csv_cell" style="border: 1px solid #eee; padding: 0;">
                    <input type="text" value="${this.escape_html(cell)}" class="csv_input" style="width: 100%; border: none; padding: 8px; font-size: 13px;">
                </td>`;
            });
            html += '</tr>';
        }
        html += '</tbody>';
        html += '</table>';
        
        return html;
    },
    
    /**
     * Escape HTML characters
     */
    escape_html: function(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },
    
    /**
     * Update table statistics
     */
    update_table_stats: function() {
        const rows = $('.csv_table tbody tr').length;
        const cols = $('.csv_table thead th').length;
        
        $('.csv_row_count').text(rows);
        $('.csv_col_count').text(cols);
    },
    
    /**
     * Save CSV file
     */
    save_csv_file: function(data, layero, index) {
        const that = this;
        const csv_content = this.export_table_to_csv($('.csv_table'));
        
        bt.send('WriteFileBody', 'files/WriteFileBody', {
            filename: data.path,
            content: csv_content
        }, function(res) {
            if (res.status) {
                layer.msg('File saved successfully', { icon: 1 });
            } else {
                layer.msg('Failed to save file: ' + res.msg, { icon: 2 });
            }
        });
    },
    
    /**
     * Export table to CSV format
     */
    export_table_to_csv: function(table_element, delimiter = null) {
        if (!delimiter) delimiter = this.delimiter;
        const quote = this.quote_char || '"';
        const escaped_quote = quote + quote;
        
        const rows = [];
        
        table_element.find('tr').each(function() {
            const cells = [];
            $(this).find('th input, td input').each(function() {
                const value = $(this).val() || '';
                // Quote if contains delimiter or quotes
                if (value.includes(delimiter) || value.includes(quote) || value.includes('\n')) {
                    cells.push(quote + value.replace(new RegExp(quote, 'g'), escaped_quote) + quote);
                } else {
                    cells.push(value);
                }
            });
            if (cells.length > 0) {
                rows.push(cells.join(delimiter));
            }
        });
        
        return rows.join('\n');
    },
    
    /**
     * Show CSV settings dialog
     */
    show_csv_settings_dialog: function(data) {
        const that = this;
        
        layer.open({
            type: 1,
            title: 'CSV Settings',
            area: '400px',
            closeBtn: 2,
            content: `
                <div class="bt-form pd20 pb70">
                    <div class="line">
                        <span class="tname">Delimiter</span>
                        <div class="info-r">
                            <select class="bt-input-text settings_delimiter" style="width: 100%;">
                                <option value="comma" selected>Comma (,)</option>
                                <option value="tab">Tab (\\t)</option>
                                <option value="space">Space ( )</option>
                                <option value="semicolon">Semicolon (;)</option>
                                <option value="pipe">Pipe (|)</option>
                            </select>
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">Encoding</span>
                        <div class="info-r">
                            <select class="bt-input-text settings_encoding" style="width: 100%;">
                                <option value="utf-8" selected>UTF-8</option>
                                <option value="gb2312">GB2312</option>
                                <option value="gbk">GBK</option>
                                <option value="iso-8859-1">ISO-8859-1</option>
                            </select>
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">Quote Character</span>
                        <div class="info-r">
                            <input type="text" class="bt-input-text settings_quote" value='"' maxlength="1" style="width: 100%;">
                        </div>
                    </div>
                </div>
            `,
            btn: ['Save', 'Cancel'],
            yes: function(index) {
                that.delimiter = that.delimiter_options[$('.settings_delimiter').val()];
                that.encoding = $('.settings_encoding').val();
                that.quote_char = $('.settings_quote').val() || '"';
                layer.close(index);
                layer.msg('Settings saved', { icon: 1 });
            }
        });
    },
    
    /**
     * Show export options dialog
     */
    show_export_options: function(data) {
        const that = this;
        
        layer.open({
            type: 1,
            title: 'Export Options',
            area: '450px',
            closeBtn: 2,
            content: `
                <div class="bt-form pd20 pb70">
                    <div class="line">
                        <span class="tname">Format</span>
                        <div class="info-r">
                            <select class="bt-input-text export_format" style="width: 100%;">
                                <option value="csv">CSV</option>
                                <option value="json">JSON</option>
                                <option value="xlsx">Excel (XLSX)</option>
                                <option value="html">HTML Table</option>
                            </select>
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">File Name</span>
                        <div class="info-r">
                            <input type="text" class="bt-input-text export_filename" value="${data.filename.split('.')[0]}" style="width: 100%;">
                        </div>
                    </div>
                </div>
            `,
            btn: ['Export', 'Cancel'],
            yes: function(index) {
                const format = $('.export_format').val();
                const filename = $('.export_filename').val();
                
                that.export_file(format, filename);
                layer.close(index);
            }
        });
    },
    
    /**
     * Export file in specified format
     */
    export_file: function(format, filename) {
        const table_element = $('.csv_table');
        let content = '';
        let mime_type = 'text/plain';
        
        switch(format) {
            case 'csv':
                content = this.export_table_to_csv(table_element);
                mime_type = 'text/csv';
                filename += '.csv';
                break;
            case 'json':
                content = this.export_table_to_json(table_element);
                mime_type = 'application/json';
                filename += '.json';
                break;
            case 'html':
                content = this.export_table_to_html(table_element);
                mime_type = 'text/html';
                filename += '.html';
                break;
        }
        
        // Download file
        const blob = new Blob([content], { type: mime_type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        layer.msg('File exported: ' + filename, { icon: 1 });
    },
    
    /**
     * Export table to JSON
     */
    export_table_to_json: function(table_element) {
        const headers = [];
        const data = [];
        
        table_element.find('thead th input').each(function() {
            headers.push($(this).val());
        });
        
        table_element.find('tbody tr').each(function() {
            const row = {};
            $(this).find('td input').each((index) => {
                row[headers[index]] = $(this).val();
            });
            data.push(row);
        });
        
        return JSON.stringify(data, null, 2);
    },
    
    /**
     * Export table to HTML
     */
    export_table_to_html: function(table_element) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>CSV Data</title>
    <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
    </style>
</head>
<body>
    ${table_element.prop('outerHTML')}
</body>
</html>
        `;
        
        return html;
    },
    
    /**
     * Show convert format dialog
     */
    show_convert_dialog: function(data) {
        const that = this;
        
        layer.open({
            type: 1,
            title: 'Convert File Format',
            area: '450px',
            closeBtn: 2,
            content: `
                <div class="bt-form pd20 pb70">
                    <div class="line">
                        <span class="tname">Current Format</span>
                        <div class="info-r">
                            <input type="text" class="bt-input-text" value="${data.ext.toUpperCase()}" disabled style="width: 100%;">
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">Convert To</span>
                        <div class="info-r">
                            <select class="bt-input-text convert_to_format" style="width: 100%;">
                                <option value="csv">CSV</option>
                                <option value="tsv">TSV (Tab-Separated)</option>
                                <option value="txt">Text</option>
                                <option value="json">JSON</option>
                                <option value="bytes">Bytes (.bytes) - Binary</option>
                            </select>
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">Source Delimiter (for TSV/CSV)</span>
                        <div class="info-r">
                            <select class="bt-input-text convert_source_delim" style="width: 100%;">
                                <option value="comma">Comma (,)</option>
                                <option value="tab">Tab (\\t)</option>
                                <option value="space">Space ( )</option>
                                <option value="semicolon">Semicolon (;)</option>
                            </select>
                        </div>
                    </div>
                </div>
            `,
            btn: ['Convert', 'Cancel'],
            yes: function(index) {
                const target_format = $('.convert_to_format').val();
                that.convert_file_format(data, target_format);
                layer.close(index);
            }
        });
    },

    /**
     * Convert file format (CSV, TSV, TXT, JSON, Bytes)
     */
    convert_file_format: function(data, target_format) {
        const that = this;
        const source_delim_name = $('.convert_source_delim').val();
        const source_delim = this.delimiter_options[source_delim_name] || ',';
        
        const loadT = bt.load('Converting file...');
        
        bt.send('GetFileBody', 'files/GetFileBody', {
            filename: data.path
        }, function(res) {
            loadT.close();
            
            if (!res.status) {
                layer.msg('Failed to load file: ' + res.msg, { icon: 2 });
                return;
            }
            
            try {
                const csv_table = that.parse_csv(res.data, source_delim);
                if (csv_table.length === 0) {
                    layer.msg('File is empty, nothing to convert', { icon: 0 });
                    return;
                }
                
                // ── Bytes conversion (binary) ───────────────────────
                if (target_format === 'bytes') {
                    that._convert_to_bytes(data, csv_table);
                    return;
                }
                
                let target_content = '';
                let target_ext = target_format;
                
                if (target_format === 'csv') {
                    target_content = that.table_to_delimited_string(csv_table, ',');
                } else if (target_format === 'tsv') {
                    target_content = that.table_to_delimited_string(csv_table, '\t');
                    target_ext = 'tsv';
                } else if (target_format === 'txt') {
                    target_content = that.table_to_delimited_string(csv_table, ',');
                    target_ext = 'txt';
                } else if (target_format === 'json') {
                    const headers = csv_table[0];
                    const json_data = [];
                    for (let i = 1; i < csv_table.length; i++) {
                        const row_obj = {};
                        csv_table[i].forEach((cell, idx) => {
                            const header_name = headers[idx] || `column_${idx + 1}`;
                            row_obj[header_name] = cell;
                        });
                        json_data.push(row_obj);
                    }
                    target_content = JSON.stringify(json_data, null, 4);
                }
                
                const path_parts = data.path.split('.');
                if (path_parts.length > 1) {
                    path_parts.pop();
                }
                const new_path = path_parts.join('.') + '.' + target_ext;
                
                const saveT = bt.load('Saving converted file...');
                bt.send('WriteFileBody', 'files/WriteFileBody', {
                    filename: new_path,
                    content: target_content
                }, function(save_res) {
                    saveT.close();
                    if (save_res.status) {
                        layer.msg('Successfully converted and saved to: ' + new_path, { icon: 1 });
                        if (typeof bt_file !== 'undefined' && typeof bt_file.get_list === 'function') {
                            bt_file.get_list();
                        }
                    } else {
                        layer.msg('Failed to save converted file: ' + save_res.msg, { icon: 2 });
                    }
                });
            } catch (err) {
                layer.msg('Error during conversion: ' + err.message, { icon: 2 });
            }
        });
    },

    /**
     * Internal: convert table data to .bytes and save
     */
    _convert_to_bytes: function(data, csv_table) {
        const that = this;

        if (csv_table.length < 2) {
            layer.msg('Table must have at least a header row and one data row', { icon: 0 });
            return;
        }

        if (typeof csvBytesConverter === 'undefined') {
            layer.msg('Bytes converter module is not loaded', { icon: 2 });
            return;
        }

        // Auto-detect column types
        const headerRow = csv_table[0];
        const dataRows = csv_table.slice(1);
        const detectedTypes = [];
        for (let c = 0; c < headerRow.length; c++) {
            const colValues = dataRows.map(row => (c < row.length ? row[c] : ''));
            detectedTypes.push(csvBytesConverter.inferColumnType(colValues));
        }

        // Show type configuration dialog
        that._show_bytes_type_dialog(data, csv_table, headerRow, detectedTypes);
    },

    /**
     * Show column type configuration dialog before bytes export
     */
    _show_bytes_type_dialog: function(data, csv_table, headerRow, detectedTypes) {
        const that = this;
        const typeNames = ['int', 'float', 'double', 'uint', 'long', 'string', 'bool', 'byte', 'short'];
        let xmlFields = null;

        let rows_html = '';
        for (let i = 0; i < headerRow.length; i++) {
            const detected = csvBytesConverter.getTypeName(detectedTypes[i]);
            let options_html = '';
            typeNames.forEach(function(tn) {
                const sel = (tn === detected) ? ' selected' : '';
                options_html += '<option value="' + tn + '"' + sel + '>' + tn + '</option>';
            });
            rows_html += '<tr>' +
                '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + (headerRow[i] || 'col_' + i) + '</td>' +
                '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' +
                    '<select class="bt-input-text bytes_col_type" data-col="' + i + '" style="width:100%;padding:4px;">' + options_html + '</select>' +
                '</td>' +
                '</tr>';
        }

        const areaHeight = '530px';
        layer.open({
            type: 1,
            title: 'Configure Column Types for .bytes Export',
            area: ['560px', areaHeight],
            closeBtn: 2,
            content: '<div class="bt-form pd20" style="padding-bottom:15px; height: calc(100% - 50px); box-sizing: border-box; display: flex; flex-direction: column;">' +
                // XML Selection Block
                '<div style="margin-bottom:12px; padding:10px; background:#f9f9f9; border:1px dashed #ccc; border-radius:4px; display:flex; flex-direction:column; gap:6px;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                        '<label class="btn btn-default btn-xs" style="position:relative; overflow:hidden; cursor:pointer; margin:0;">' +
                            'Select Schema XML (cvs.xml)...' +
                            '<input type="file" id="schema_xml_input" accept=".xml" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;" />' +
                        '</label>' +
                        '<label style="margin:0; font-weight:normal; cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px;">' +
                            '<input type="checkbox" id="bytes_skip_second_row" checked /> Skip 2nd row (type/comment hints)' +
                        '</label>' +
                    '</div>' +
                    '<div id="schema_xml_status" style="color:#777; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">No XML schema loaded. Using auto-detected column types.</div>' +
                '</div>' +
                '<div style="margin-bottom:8px;color:#666;font-size:12px;">Columns mapping preview:</div>' +
                '<div style="flex:1; min-height:150px; overflow-y:auto; border:1px solid #eee; border-radius:4px; margin-bottom:15px;">' +
                '<table style="width:100%;border-collapse:collapse;">' +
                '<thead id="bytes_columns_thead"><tr>' +
                    '<th style="padding:8px;background:#f5f5f5;text-align:left;border-bottom:2px solid #ddd;font-size:12px;">Column</th>' +
                    '<th style="padding:8px;background:#f5f5f5;text-align:left;border-bottom:2px solid #ddd;font-size:12px;">Data Type</th>' +
                '</tr></thead>' +
                '<tbody id="bytes_columns_tbody">' + rows_html + '</tbody>' +
                '</table></div></div>',
            btn: ['Export .bytes', 'Cancel'],
            success: function(layero, index) {
                // Bind file input handler
                layero.find('#schema_xml_input').on('change', function(e) {
                    const file = e.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        try {
                            const xmlText = evt.target.result;
                            const fileName = data.path.split('/').pop().split('\\').pop();
                            const tableName = fileName.substring(0, fileName.lastIndexOf('.'));

                            xmlFields = that._parse_schema_xml(xmlText, tableName);

                            layero.find('#schema_xml_status').html(
                                '<span style="color:green;font-weight:bold;">Loaded: ' + xmlFields.length + ' fields (' + tableName + ')</span>'
                            );

                            // Redraw preview rows using XML schema
                            let new_rows_html = '';
                            xmlFields.forEach(function(f, idx) {
                                const matchIdx = headerRow.findIndex(name => name.trim() === f.colName);
                                const statusStr = matchIdx !== -1 
                                    ? '<span style="color:green;font-weight:bold;">Matched (Col ' + matchIdx + ')</span>'
                                    : '<span style="color:orange;font-weight:bold;">Missing (Will write empty)</span>';
                                
                                new_rows_html += '<tr>' +
                                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">' + f.colName + '</td>' +
                                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;">' + f.clientType + '</td>' +
                                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;">' + statusStr + '</td>' +
                                    '</tr>';
                            });

                            layero.find('#bytes_columns_thead').html('<tr>' +
                                '<th style="padding:8px;background:#f5f5f5;text-align:left;border-bottom:2px solid #ddd;font-size:12px;">XML Field Name</th>' +
                                '<th style="padding:8px;background:#f5f5f5;text-align:left;border-bottom:2px solid #ddd;font-size:12px;">Client Type</th>' +
                                '<th style="padding:8px;background:#f5f5f5;text-align:left;border-bottom:2px solid #ddd;font-size:12px;">Match Status</th>' +
                                '</tr>');
                            layero.find('#bytes_columns_tbody').html(new_rows_html);

                        } catch (err) {
                            layer.msg('Error parsing schema XML: ' + err.message, { icon: 2 });
                            layero.find('#schema_xml_status').text('Error loading XML: ' + err.message);
                            xmlFields = null;
                        }
                    };
                    reader.readAsText(file);
                });
            },
            yes: function(index) {
                const skipSecondRow = $('#bytes_skip_second_row').is(':checked');

                if (xmlFields) {
                    // Reorder columns to align with XML fields
                    const reorderedTable = [];
                    for (let r = 0; r < csv_table.length; r++) {
                        reorderedTable.push([]);
                    }

                    xmlFields.forEach(function(f) {
                        const txtColIdx = headerRow.findIndex(name => name.trim() === f.colName);
                        if (txtColIdx === -1) {
                            for (let r = 0; r < csv_table.length; r++) {
                                reorderedTable[r].push(r === 0 ? f.colName : '');
                            }
                        } else {
                            for (let r = 0; r < csv_table.length; r++) {
                                reorderedTable[r].push(csv_table[r][txtColIdx]);
                            }
                        }
                    });

                    const columnDefs = xmlFields.map(function(f) {
                        return {
                            fieldType: f.fieldType,
                            dataType: f.dataType,
                            count: f.count,
                            post: f.post
                        };
                    });

                    layer.close(index);
                    that._execute_bytes_export(data, reorderedTable, {
                        columnDefs: columnDefs,
                        skipSecondRow: skipSecondRow
                    });
                } else {
                    // Normal export using auto-detected/selected types
                    const columnTypes = [];
                    for (let c = 0; c < headerRow.length; c++) {
                        const selectedName = $('.bytes_col_type[data-col="' + c + '"]').val();
                        columnTypes.push(csvBytesConverter.parseTypeName(selectedName));
                    }

                    layer.close(index);
                    that._execute_bytes_export(data, csv_table, {
                        columnTypes: columnTypes,
                        skipSecondRow: skipSecondRow
                    });
                }
            }
        });
    },

    /**
     * Parse cvs.xml schema for a given table name
     */
    _parse_schema_xml: function(xmlText, tableName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        const parserError = xmlDoc.getElementsByTagName('parsererror');
        if (parserError.length > 0) {
            throw new Error('Invalid XML file format.');
        }
        
        const structs = xmlDoc.getElementsByTagName('PGCVSStruct');
        let structNode = null;
        for (let i = 0; i < structs.length; i++) {
            const tNode = structs[i].getElementsByTagName('TableName')[0] || structs[i].getElementsByTagName('Name')[0];
            if (tNode) {
                const tText = tNode.textContent.trim();
                if (tText === tableName || tText.indexOf(tableName + '|') === 0) {
                    structNode = structs[i];
                    break;
                }
            }
        }
        
        if (!structNode) {
            throw new Error("Table struct for '" + tableName + "' not found in XML.");
        }
        
        const fieldNodes = structNode.getElementsByTagName('PGCVSField');
        const fields = [];
        
        for (let i = 0; i < fieldNodes.length; i++) {
            const fNode = fieldNodes[i];
            
            const serverOnlyNode = fNode.getElementsByTagName('ServerOnly')[0];
            const serverOnly = serverOnlyNode ? serverOnlyNode.textContent.trim() === 'true' : false;
            if (serverOnly) continue;
            
            const nameNode = fNode.getElementsByTagName('Name')[0];
            const name = nameNode ? nameNode.textContent.trim() : '';
            
            const colNameNode = fNode.getElementsByTagName('ColNameInExcel')[0];
            const colName = colNameNode ? colNameNode.textContent.trim() : name;
            
            const typeNode = fNode.getElementsByTagName('ClientType')[0] || fNode.getElementsByTagName('Type')[0];
            let clientType = typeNode ? typeNode.textContent.trim() : 'string';
            
            // Resolve HTML entities if any left
            clientType = clientType.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            
            let fieldType = csvBytesConverter.EFieldType.EValue;
            let dataType = csvBytesConverter.EDataType.STRING;
            let count = 2;
            let baseType = clientType;
            
            if (clientType.indexOf('vector<') === 0) {
                fieldType = csvBytesConverter.EFieldType.EArray;
                if (clientType.indexOf('Sequence<') !== -1) {
                    fieldType = csvBytesConverter.EFieldType.ESeqList;
                    const match = clientType.match(/Sequence<(.*?),\s*(\d+)>/);
                    if (match) {
                        baseType = match[1];
                        count = parseInt(match[2], 10);
                    }
                } else {
                    baseType = clientType.substring(7, clientType.length - 1);
                }
            } else if (clientType.indexOf('Sequence<') === 0) {
                fieldType = csvBytesConverter.EFieldType.ESeq;
                const match = clientType.match(/Sequence<(.*?),\s*(\d+)>/);
                if (match) {
                    baseType = match[1];
                    count = parseInt(match[2], 10);
                }
            }
            
            dataType = csvBytesConverter.parseTypeName(baseType);
            const post = csvBytesConverter.getPostSuffix(dataType);
            
            fields.push({
                name: name,
                colName: colName,
                clientType: clientType,
                fieldType: fieldType,
                dataType: dataType,
                count: count,
                post: post
            });
        }
        
        return fields;
    },

    /**
     * Execute .bytes export with given options
     */
    _execute_bytes_export: function(data, csv_table, options) {
        const that = this;

        try {
            const saveT = bt.load('Generating .bytes file...');

            const bytesData = csvBytesConverter.convertTableToBytes(csv_table, {
                columnTypes: options.columnTypes,
                columnDefs: options.columnDefs,
                skipSecondRow: options.skipSecondRow
            });

            // Build target path
            const path_parts = data.path.split('.');
            if (path_parts.length > 1) path_parts.pop();
            const new_path = path_parts.join('.') + '.bytes';

            // Encode binary as Base64 for transport
            const base64Content = csvBytesConverter.uint8ArrayToBase64(bytesData);

            // Save via panel API using base64 content
            bt.send('WriteFileBody', 'files/WriteFileBody', {
                filename: new_path,
                content: base64Content,
                encoding: 'base64'
            }, function(save_res) {
                saveT.close();
                if (save_res.status) {
                    layer.msg('Successfully exported to: ' + new_path + ' (' + bytesData.length + ' bytes)', { icon: 1 });
                    if (typeof bt_file !== 'undefined' && typeof bt_file.get_list === 'function') {
                        bt_file.get_list();
                    }
                } else {
                    // Fallback: try writing as raw binary string
                    that._save_bytes_fallback(new_path, bytesData, saveT);
                }
            });
        } catch (err) {
            layer.msg('Error generating .bytes: ' + err.message, { icon: 2 });
        }
    },

    /**
     * Fallback: save bytes by writing raw binary via Blob download
     */
    _save_bytes_fallback: function(filePath, bytesData, loadHandle) {
        if (loadHandle) loadHandle.close();
        try {
            // Offer direct download as fallback
            const blob = new Blob([bytesData], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filePath.split('/').pop();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            layer.msg('File downloaded as: ' + a.download + ' (server save unavailable, downloaded to browser)', { icon: 1 });
        } catch (err2) {
            layer.msg('Failed to save .bytes file: ' + err2.message, { icon: 2 });
        }
    },

    /**
     * Helper to convert 2D array back to delimited string
     */
    table_to_delimited_string: function(table, delimiter) {
        const quote = this.quote_char || '"';
        const escaped_quote = quote + quote;
        return table.map(row => {
            return row.map(cell => {
                const cell_str = String(cell);
                if (cell_str.includes(delimiter) || cell_str.includes(quote) || cell_str.includes('\n')) {
                    return quote + cell_str.replace(new RegExp(quote, 'g'), escaped_quote) + quote;
                }
                return cell_str;
            }).join(delimiter);
        }).join('\n');
    }
};

// Initialize on document ready
$(document).ready(function() {
    if (typeof csvFileManagerIntegration !== 'undefined') {
        csvFileManagerIntegration.init();
    }
});
