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
        this.extend_file_manager_menu();
        this.bind_events();
    },
    
    /**
     * Extend the existing file manager menu with CSV-specific options
     */
    extend_file_manager_menu: function() {
        const that = this;
        
        // Hook into existing file manager context menu
        $(document).on('contextmenu', '.csv_table_container, [data-file-type="csv"]', function(e) {
            e.preventDefault();
            const file_path = $(this).attr('data-menu-path') || $(this).attr('title');
            that.show_csv_menu(e.clientX, e.clientY, file_path, this);
        });
    },
    
    /**
     * Bind events for CSV table interactions
     */
    bind_events: function() {
        const that = this;
        
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
        const new_row = $('<tr class="csv_row"></tr>');
        row.find('td').each(function() {
            new_row.append('<td class="csv_cell"><input type="text" class="csv_input"></td>');
        });
        row.before(new_row);
        layer.msg('Row inserted', { icon: 1 });
        this.mark_modified();
    },
    
    delete_row: function(target) {
        const that = this;
        layer.confirm('Are you sure you want to delete this row?', {
            icon: 3,
            closeBtn: 2
        }, function(index) {
            $(target).closest('tr').remove();
            layer.close(index);
            layer.msg('Row deleted', { icon: 1 });
            that.mark_modified();
        });
    },
    
    /**
     * Column operations
     */
    insert_column: function(target) {
        const cell = $(target).closest('td');
        const col_index = cell.index();
        
        $('table.csv_table tbody tr').each(function() {
            $(this).find('td').eq(col_index).before(
                '<td class="csv_cell"><input type="text" class="csv_input"></td>'
            );
        });
        
        layer.msg('Column inserted', { icon: 1 });
        this.mark_modified();
    },
    
    delete_column: function(target) {
        const that = this;
        const cell = $(target).closest('td');
        const col_index = cell.index();
        
        layer.confirm('Are you sure you want to delete this column?', {
            icon: 3,
            closeBtn: 2
        }, function(index) {
            $('table.csv_table tbody tr').each(function() {
                $(this).find('td').eq(col_index).remove();
            });
            layer.close(index);
            layer.msg('Column deleted', { icon: 1 });
            that.mark_modified();
        });
    },
    
    /**
     * Clipboard operations
     */
    cut_cells: function() {
        this.copy_cells();
        this.current_selection.html('');
        layer.msg('Cut to clipboard', { icon: 1 });
    },
    
    copy_cells: function() {
        const cells = this.current_selection || $('.csv_cell.selected');
        if (cells.length === 0) {
            layer.msg('Please select cells first', { icon: 2 });
            return;
        }
        
        this.clipboard = cells.map(function() {
            return $(this).text();
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
        
        cells.each((index) => {
            if (index < this.clipboard.length) {
                $(cells[index]).text(this.clipboard[index]);
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
            $cell.css({
                'color': color,
                'background-color': bgcolor,
                'font-weight': bold ? 'bold' : 'normal',
                'font-style': italic ? 'italic' : 'normal'
            });
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
        layer.msg('Alignment: ' + alignment, { icon: 1 });
        this.mark_modified();
    },
    
    /**
     * Sort column
     */
    sort_column: function(direction) {
        const $table = $('table.csv_table');
        const rows = $table.find('tbody tr').toArray();
        
        rows.sort((a, b) => {
            const val_a = $(a).find('td').eq(0).text();
            const val_b = $(b).find('td').eq(0).text();
            return direction === 'asc' 
                ? val_a.localeCompare(val_b)
                : val_b.localeCompare(val_a);
        });
        
        $table.find('tbody').html('');
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
        $('table.csv_table tbody tr').each((index, row) => {
            const cell_text = $(row).find('td').eq(0).text();
            let match = false;
            
            switch(type) {
                case 'contains':
                    match = cell_text.includes(value);
                    break;
                case 'equals':
                    match = cell_text === value;
                    break;
                case 'starts':
                    match = cell_text.startsWith(value);
                    break;
                case 'ends':
                    match = cell_text.endsWith(value);
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
                $(this).find('td, th').each(function() {
                    row.push('"' + $(this).text().replace(/"/g, '""') + '"');
                });
                data += row.join(',') + '\n';
            });
            
            this.download_file(data, 'data.csv', 'text/csv');
        } else if (format === 'json') {
            const headers = [];
            $table.find('thead th').each(function() {
                headers.push($(this).text());
            });
            
            const rows = [];
            $table.find('tbody tr').each(function() {
                const row = {};
                $(this).find('td').each((index, td) => {
                    row[headers[index]] = $(td).text();
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
        // Implement range selection logic
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
