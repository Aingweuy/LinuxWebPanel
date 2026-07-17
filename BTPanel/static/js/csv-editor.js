/**
 * CSV Editor with Right-Click Menu Integration
 * Integrates with the existing file manager context menu system
 */

const csvEditor = {
    current_file: null,
    is_editing: false,
    table_data: [],
    clipboard: null,
    current_selection: null,
    
    /**
     * Initialize CSV editor and integrate with file manager menu
     */
    init: function() {
        this.intercept_global_editor();
        this.extend_file_manager_menu();
        this.bind_events();
    },
    
    /**
     * Intercept global openEditorView to handle .csv and .tsv files
     */
    intercept_global_editor: function() {
        const that = this;
        if (window.original_openEditorView) return; // Prevent duplicate intercepts
        
        const original_open = window.openEditorView;
        if (typeof original_open === 'function') {
            window.original_openEditorView = original_open;
            window.openEditorView = function(type, path) {
                if (path) {
                    const ext = path.toLowerCase().split('.').pop();
                    if (ext === 'csv' || ext === 'tsv') {
                        const data = {
                            path: path,
                            filename: path.split('/').pop(),
                            ext: ext
                        };
                        if (typeof csvFileManagerIntegration !== 'undefined') {
                            csvFileManagerIntegration.open_csv_editor(data);
                            return;
                        }
                    }
                }
                original_open.call(this, type, path);
            };
        }
    },
    
    /**
     * Extend the existing file manager menu with CSV-specific options
     */
    extend_file_manager_menu: function() {
        const that = this;
        
        // Remove previous listener to prevent duplicate bindings
        $(document).off('contextmenu', '.csv_table td.csv_cell, .csv_table th');
        
        // Context menu inside CSV editor table
        $(document).on('contextmenu', '.csv_table td.csv_cell, .csv_table th', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const cell = $(this);
            that.current_col_index = cell.index();
            
            // Highlight the cell
            $('.csv_cell').removeClass('selected');
            if (cell.hasClass('csv_cell')) {
                cell.addClass('selected');
                that.current_selection = cell;
            } else {
                that.current_selection = null;
            }
            
            const file_path = that.current_file;
            that.show_csv_menu(e.clientX, e.clientY, file_path, this);
        });
    },
    
    /**
     * Bind events for CSV table interactions
     */
    bind_events: function() {
        const that = this;
        
        // Remove previous listeners first
        $(document).off('click', '.csv_cell');
        $(document).off('input', '.csv_input, .csv_header_cell');
        
        // Cell selection
        $(document).on('click', '.csv_cell', function(e) {
            if (e.ctrlKey || e.metaKey) {
                $(this).toggleClass('selected');
            } else if (e.shiftKey) {
                that.select_range(this);
            } else {
                $('.csv_cell').removeClass('selected');
                $(this).addClass('selected');
            }
            that.current_selection = $('.csv_cell.selected');
        });
        
        // Mark as modified on user input
        $(document).on('input', '.csv_input, .csv_header_cell', function() {
            that.mark_modified();
        });
        
        // Close menu on outside click
        $(document).on('click', function(e) {
            if (!$(e.target).closest('.csv_popup_menu').length) {
                $('.csv_popup_menu').remove();
            }
        });
    },
    
    /**
     * Display CSV-specific popup menu integrated with file manager
     */
    show_csv_menu: function(x, y, file_path, target) {
        const that = this;
        this.current_file = file_path;
        
        const menu_html = `
            <div class="csv_popup_menu ace_catalogue_menu" style="position: fixed; left: ${x}px; top: ${y}px; z-index: 99999;">
                <ul class="csv_menu_list">
                    <li class="csv_menu_item csv_menu_group_header">Cell Operations</li>
                    <li class="csv_menu_item" data-action="insert_row">
                        <i class="glyphicon glyphicon-plus"></i>
                        <span>Insert Row Above</span>
                    </li>
                    <li class="csv_menu_item" data-action="delete_row">
                        <i class="glyphicon glyphicon-minus"></i>
                        <span>Delete Row</span>
                    </li>
                    <li class="csv_menu_item" data-action="insert_column">
                        <i class="glyphicon glyphicon-plus"></i>
                        <span>Insert Column Left</span>
                    </li>
                    <li class="csv_menu_item" data-action="delete_column">
                        <i class="glyphicon glyphicon-minus"></i>
                        <span>Delete Column</span>
                    </li>
                    
                    <li class="csv_menu_divider"></li>
                    <li class="csv_menu_item csv_menu_group_header">Edit</li>
                    
                    <li class="csv_menu_item" data-action="cut">
                        <i class="glyphicon glyphicon-scissors"></i>
                        <span>Cut</span>
                    </li>
                    <li class="csv_menu_item" data-action="copy">
                        <i class="glyphicon glyphicon-copy"></i>
                        <span>Copy</span>
                    </li>
                    <li class="csv_menu_item" data-action="paste">
                        <i class="glyphicon glyphicon-paste"></i>
                        <span>Paste</span>
                    </li>
                    
                    <li class="csv_menu_divider"></li>
                    <li class="csv_menu_item csv_menu_group_header">Format</li>
                    
                    <li class="csv_menu_item" data-action="format_cells">
                        <i class="glyphicon glyphicon-text-color"></i>
                        <span>Format Cells...</span>
                    </li>
                    <li class="csv_menu_item" data-action="align_left">
                        <i class="glyphicon glyphicon-align-left"></i>
                        <span>Align Left</span>
                    </li>
                    <li class="csv_menu_item" data-action="align_center">
                        <i class="glyphicon glyphicon-align-center"></i>
                        <span>Align Center</span>
                    </li>
                    <li class="csv_menu_item" data-action="align_right">
                        <i class="glyphicon glyphicon-align-right"></i>
                        <span>Align Right</span>
                    </li>
                    
                    <li class="csv_menu_divider"></li>
                    <li class="csv_menu_item csv_menu_group_header">Data</li>
                    
                    <li class="csv_menu_item" data-action="sort_asc">
                        <i class="glyphicon glyphicon-arrow-up"></i>
                        <span>Sort Ascending</span>
                    </li>
                    <li class="csv_menu_item" data-action="sort_desc">
                        <i class="glyphicon glyphicon-arrow-down"></i>
                        <span>Sort Descending</span>
                    </li>
                    <li class="csv_menu_item" data-action="filter">
                        <i class="glyphicon glyphicon-filter"></i>
                        <span>Filter Column</span>
                    </li>
                    
                    <li class="csv_menu_divider"></li>
                    <li class="csv_menu_item" data-action="export_csv">
                        <i class="glyphicon glyphicon-download"></i>
                        <span>Export as CSV</span>
                    </li>
                    <li class="csv_menu_item" data-action="export_json">
                        <i class="glyphicon glyphicon-download"></i>
                        <span>Export as JSON</span>
                    </li>
                </ul>
            </div>
        `;
        
        // Remove previous menu
        $('.csv_popup_menu').remove();
        
        // Add new menu with same styling as file manager menu
        $('body').append(menu_html);
        
        // Bind menu item click handlers
        $('.csv_popup_menu .csv_menu_item[data-action]').on('click', function() {
            const action = $(this).data('action');
            that.handle_menu_action(action, target);
            $('.csv_popup_menu').remove();
        });
    },
    
    /**
     * Handle menu actions
     */
    handle_menu_action: function(action, target) {
        switch(action) {
            case 'insert_row':
                this.insert_row(target);
                break;
            case 'delete_row':
                this.delete_row(target);
                break;
            case 'insert_column':
                this.insert_column(target);
                break;
            case 'delete_column':
                this.delete_column(target);
                break;
            case 'cut':
                this.cut_cells();
                break;
            case 'copy':
                this.copy_cells();
                break;
            case 'paste':
                this.paste_cells();
                break;
            case 'format_cells':
                this.show_format_dialog();
                break;
            case 'align_left':
                this.align_cells('left');
                break;
            case 'align_center':
                this.align_cells('center');
                break;
            case 'align_right':
                this.align_cells('right');
                break;
            case 'sort_asc':
                this.sort_column('asc');
                break;
            case 'sort_desc':
                this.sort_column('desc');
                break;
            case 'filter':
                this.show_filter_dialog();
                break;
            case 'export_csv':
                this.export_data('csv');
                break;
            case 'export_json':
                this.export_data('json');
                break;
        }
    },
    
    /**
     * Row operations
     */
    insert_row: function(target) {
        const row = $(target).closest('tr');
        if (row.parent().is('thead') || row.closest('thead').length > 0) {
            layer.msg('Cannot insert row above headers', { icon: 0 });
            return;
        }
        
        const new_row = $('<tr class="csv_row"></tr>');
        const col_count = $('table.csv_table thead th').length;
        for (let i = 0; i < col_count; i++) {
            new_row.append('<td class="csv_cell"><input type="text" class="csv_input"></td>');
        }
        
        row.before(new_row);
        layer.msg('Row inserted', { icon: 1 });
        this.mark_modified();
        
        if (typeof csvFileManagerIntegration !== 'undefined') {
            csvFileManagerIntegration.update_table_stats();
        }
    },
    
    delete_row: function(target) {
        const that = this;
        const row = $(target).closest('tr');
        if (row.parent().is('thead') || row.closest('thead').length > 0) {
            layer.msg('Cannot delete header row', { icon: 0 });
            return;
        }
        
        layer.confirm('Are you sure you want to delete this row?', {
            icon: 3,
            closeBtn: 2
        }, function(index) {
            row.remove();
            layer.close(index);
            layer.msg('Row deleted', { icon: 1 });
            that.mark_modified();
            
            if (typeof csvFileManagerIntegration !== 'undefined') {
                csvFileManagerIntegration.update_table_stats();
            }
        });
    },
    
    /**
     * Column operations
     */
    insert_column: function(target) {
        const cell = $(target).closest('td, th');
        const col_index = cell.index();
        
        $('table.csv_table thead tr').each(function() {
            const th = $(this).find('th').eq(col_index);
            const new_th = $(`
                <th style="border: 1px solid #ddd; padding: 10px; font-weight: bold; background-color: #f0f0f0;">
                    <input type="text" value="New Column" class="csv_header_cell" style="width: 100%; border: none; background: transparent; padding: 4px; font-weight: bold;">
                </th>
            `);
            th.before(new_th);
        });
        
        $('table.csv_table tbody tr').each(function() {
            const td = $(this).find('td').eq(col_index);
            const new_td = $('<td class="csv_cell"><input type="text" class="csv_input"></td>');
            td.before(new_td);
        });
        
        layer.msg('Column inserted', { icon: 1 });
        this.mark_modified();
        
        if (typeof csvFileManagerIntegration !== 'undefined') {
            csvFileManagerIntegration.update_table_stats();
        }
    },
    
    delete_column: function(target) {
        const that = this;
        const cell = $(target).closest('td, th');
        const col_index = cell.index();
        
        layer.confirm('Are you sure you want to delete this column?', {
            icon: 3,
            closeBtn: 2
        }, function(index) {
            $('table.csv_table thead tr').each(function() {
                $(this).find('th').eq(col_index).remove();
            });
            $('table.csv_table tbody tr').each(function() {
                $(this).find('td').eq(col_index).remove();
            });
            layer.close(index);
            layer.msg('Column deleted', { icon: 1 });
            that.mark_modified();
            
            if (typeof csvFileManagerIntegration !== 'undefined') {
                csvFileManagerIntegration.update_table_stats();
            }
        });
    },
    
    /**
     * Clipboard operations
     */
    cut_cells: function() {
        this.copy_cells();
        const cells = this.current_selection || $('.csv_cell.selected');
        cells.find('input').val('');
        layer.msg('Cut to clipboard', { icon: 1 });
        this.mark_modified();
    },
    
    copy_cells: function() {
        const cells = this.current_selection || $('.csv_cell.selected');
        if (cells.length === 0) {
            layer.msg('Please select cells first', { icon: 2 });
            return;
        }
        
        this.clipboard = cells.map(function() {
            return $(this).find('input').val() || '';
        }).get();
        
        layer.msg('Copied to clipboard: ' + this.clipboard.length + ' cells', { icon: 1 });
    },
    
    paste_cells: function() {
        if (!this.clipboard || this.clipboard.length === 0) {
            layer.msg('Clipboard is empty', { icon: 2 });
            return;
        }
        
        const cells = this.current_selection || $('.csv_cell.selected');
        if (cells.length === 0) {
            layer.msg('Please select destination cells', { icon: 2 });
            return;
        }
        
        cells.each((index, cell) => {
            if (index < this.clipboard.length) {
                $(cell).find('input').val(this.clipboard[index]);
            }
        });
        
        layer.msg('Pasted from clipboard', { icon: 1 });
        this.mark_modified();
    },
    
    /**
     * Format cells dialog
     */
    show_format_dialog: function() {
        const that = this;
        layer.open({
            type: 1,
            title: 'Format Cells',
            area: '450px',
            closeBtn: 2,
            content: `
                <div class="bt-form pd20 pb70">
                    <div class="line">
                        <span class="tname">Format Type</span>
                        <div class="info-r">
                            <select class="bt-input-text format_type" style="width: 100%;">
                                <option value="general">General</option>
                                <option value="number">Number</option>
                                <option value="currency">Currency</option>
                                <option value="date">Date</option>
                                <option value="time">Time</option>
                                <option value="percentage">Percentage</option>
                                <option value="text">Text</option>
                            </select>
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">Text Color</span>
                        <div class="info-r">
                            <input type="color" class="format_color" value="#000000" style="height: 38px; cursor: pointer;">
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">Background</span>
                        <div class="info-r">
                            <input type="color" class="format_bgcolor" value="#FFFFFF" style="height: 38px; cursor: pointer;">
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">Font Weight</span>
                        <div class="info-r">
                            <label><input type="checkbox" class="format_bold"> Bold</label>
                            <label><input type="checkbox" class="format_italic" style="margin-left: 15px;"> Italic</label>
                        </div>
                    </div>
                </div>
            `,
            btn: ['Apply', 'Cancel'],
            yes: function(index) {
                that.apply_cell_format(
                    $('.format_type').val(),
                    $('.format_color').val(),
                    $('.format_bgcolor').val(),
                    $('.format_bold').is(':checked'),
                    $('.format_italic').is(':checked')
                );
                layer.close(index);
            }
        });
    },
    
    /**
     * Apply formatting to selected cells
     */
    apply_cell_format: function(type, color, bgcolor, bold, italic) {
        const cells = this.current_selection || $('.csv_cell.selected');
        
        cells.each(function() {
            const $cell = $(this);
            const $input = $cell.find('input');
            const styles = {
                'color': color,
                'background-color': bgcolor,
                'font-weight': bold ? 'bold' : 'normal',
                'font-style': italic ? 'italic' : 'normal'
            };
            $cell.css(styles);
            $input.css(styles);
            $cell.attr('data-format', type);
        });
        
        layer.msg('Format applied', { icon: 1 });
        this.mark_modified();
    },
    
    /**
     * Cell alignment
     */
    align_cells: function(alignment) {
        const cells = this.current_selection || $('.csv_cell.selected');
        cells.css('text-align', alignment);
        cells.find('input').css('text-align', alignment);
        layer.msg('Alignment: ' + alignment, { icon: 1 });
        this.mark_modified();
    },
    
    /**
     * Sort column
     */
    sort_column: function(direction) {
        const col_index = this.current_col_index !== undefined ? this.current_col_index : 0;
        const $table = $('table.csv_table');
        const rows = $table.find('tbody tr').toArray();
        
        rows.sort((a, b) => {
            const val_a = $(a).find('td').eq(col_index).find('input').val() || '';
            const val_b = $(b).find('td').eq(col_index).find('input').val() || '';
            
            // Try numeric comparison if both are numbers
            const num_a = Number(val_a);
            const num_b = Number(val_b);
            if (!isNaN(num_a) && !isNaN(num_b)) {
                return direction === 'asc' ? num_a - num_b : num_b - num_a;
            }
            
            return direction === 'asc' 
                ? val_a.localeCompare(val_b)
                : val_b.localeCompare(val_a);
        });
        
        $table.find('tbody').empty();
        rows.forEach(row => $table.find('tbody').append(row));
        
        layer.msg('Sorted ' + direction, { icon: 1 });
        this.mark_modified();
    },
    
    /**
     * Filter dialog
     */
    show_filter_dialog: function() {
        layer.open({
            type: 1,
            title: 'Filter Column',
            area: '400px',
            closeBtn: 2,
            content: `
                <div class="bt-form pd20 pb70">
                    <div class="line">
                        <span class="tname">Filter Value</span>
                        <div class="info-r">
                            <input type="text" class="bt-input-text filter_value" style="width: 100%;" placeholder="Enter filter value">
                        </div>
                    </div>
                    <div class="line">
                        <span class="tname">Match Type</span>
                        <div class="info-r">
                            <select class="bt-input-text filter_type" style="width: 100%;">
                                <option value="contains">Contains</option>
                                <option value="equals">Equals</option>
                                <option value="starts">Starts with</option>
                                <option value="ends">Ends with</option>
                            </select>
                        </div>
                    </div>
                </div>
            `,
            btn: ['Apply', 'Cancel'],
            yes: function(index) {
                const value = $('.filter_value').val();
                const type = $('.filter_type').val();
                csvEditor.apply_filter(value, type);
                layer.close(index);
            }
        });
    },
    
    /**
     * Apply filter
     */
    apply_filter: function(value, type) {
        const col_index = this.current_col_index !== undefined ? this.current_col_index : 0;
        
        if (!value) {
            $('table.csv_table tbody tr').show();
            layer.msg('Filter cleared', { icon: 1 });
            return;
        }
        
        $('table.csv_table tbody tr').each((index, row) => {
            const cell_text = $(row).find('td').eq(col_index).find('input').val() || '';
            let match = false;
            
            switch(type) {
                case 'contains':
                    match = cell_text.toLowerCase().includes(value.toLowerCase());
                    break;
                case 'equals':
                    match = cell_text.toLowerCase() === value.toLowerCase();
                    break;
                case 'starts':
                    match = cell_text.toLowerCase().startsWith(value.toLowerCase());
                    break;
                case 'ends':
                    match = cell_text.toLowerCase().endsWith(value.toLowerCase());
                    break;
            }
            
            $(row).toggle(match);
        });
        
        layer.msg('Filter applied', { icon: 1 });
    },
    
    /**
     * Export data
     */
    export_data: function(format) {
        const $table = $('table.csv_table');
        let data = '';
        
        if (format === 'csv') {
            $table.find('tr').each(function() {
                const row = [];
                $(this).find('th input, td input').each(function() {
                    row.push('"' + $(this).val().replace(/"/g, '""') + '"');
                });
                if (row.length > 0) {
                    data += row.join(',') + '\n';
                }
            });
            
            this.download_file(data, 'data.csv', 'text/csv');
        } else if (format === 'json') {
            const headers = [];
            $table.find('thead th input').each(function() {
                headers.push($(this).val());
            });
            
            const rows = [];
            $table.find('tbody tr').each(function() {
                const row = {};
                $(this).find('td input').each((index, input) => {
                    const header_name = headers[index] || `column_${index + 1}`;
                    row[header_name] = $(input).val();
                });
                rows.push(row);
            });
            
            data = JSON.stringify(rows, null, 2);
            this.download_file(data, 'data.json', 'application/json');
        }
        
        layer.msg('File exported successfully', { icon: 1 });
    },
    
    /**
     * Utility functions
     */
    select_range: function(element) {
        const $start_cell = $('.csv_cell.selected').first();
        if ($start_cell.length === 0) {
            $(element).addClass('selected');
            return;
        }
        
        const start_row = $start_cell.parent().index();
        const start_col = $start_cell.index();
        const end_row = $(element).parent().index();
        const end_col = $(element).index();
        
        const min_row = Math.min(start_row, end_row);
        const max_row = Math.max(start_row, end_row);
        const min_col = Math.min(start_col, end_col);
        const max_col = Math.max(start_col, end_col);
        
        $('.csv_cell').removeClass('selected');
        
        $('table.csv_table tbody tr').each(function(r_idx) {
            if (r_idx >= min_row && r_idx <= max_row) {
                $(this).find('td').each(function(c_idx) {
                    if (c_idx >= min_col && c_idx <= max_col) {
                        $(this).addClass('selected');
                    }
                });
            }
        });
        this.current_selection = $('.csv_cell.selected');
    },
    
    mark_modified: function() {
        this.is_editing = true;
        $('table.csv_table').addClass('modified');
    },
    
    download_file: function(content, filename, type) {
        const blob = new Blob([content], { type: type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
};

// Initialize on document ready
$(document).ready(function() {
    if (typeof csvEditor !== 'undefined') {
        csvEditor.init();
    }
});
