from dataclasses import dataclass
from io import BytesIO
from typing import List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


@dataclass
class PurchasePdfItemData:
    item_name: str
    hsn: str
    qty: int
    rate: float
    gst_percent: float
    amount: float

@dataclass
class PurchasePdfBillData:
    date: str
    bill_no: str
    items: List[PurchasePdfItemData]

@dataclass
class PurchasePdfData:
    org_name: str
    org_gstin: str
    org_address: str
    org_phone: str
    
    provider_name: str
    provider_gstin: str
    provider_phone: str
    
    date_display_text: str
    
    bills: List[PurchasePdfBillData]


def generate_purchase_pdf(data: PurchasePdfData) -> BytesIO:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4,
        rightMargin=20, 
        leftMargin=20, 
        topMargin=20, 
        bottomMargin=20
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'TitleStyle', 
        parent=styles['Normal'], 
        fontName='Helvetica-Bold', 
        fontSize=20, 
        leading=26,
        alignment=TA_CENTER,
        spaceAfter=10
    )
    header_style = ParagraphStyle(
        'HeaderStyle', 
        parent=styles['Normal'], 
        fontName='Helvetica', 
        fontSize=11, 
        leading=16,
        alignment=TA_CENTER,
        spaceAfter=5
    )
    details_label_style = ParagraphStyle(
        'DetailsLabel', 
        parent=styles['Normal'], 
        fontName='Helvetica-Bold', 
        fontSize=10, 
    )
    details_value_style = ParagraphStyle(
        'DetailsValue', 
        parent=styles['Normal'], 
        fontName='Helvetica', 
        fontSize=10,
    )
    date_range_style = ParagraphStyle(
        'DateRangeStyle', 
        parent=styles['Normal'], 
        fontName='Helvetica-Bold', 
        fontSize=11, 
        alignment=TA_CENTER,
    )
    
    # 1. Company Header
    elements.append(Paragraph(data.org_name, title_style))
    elements.append(Paragraph(f"<b>GSTIN :</b> {data.org_gstin}", header_style))
    elements.append(Paragraph(data.org_address, header_style))
    elements.append(Paragraph(f"Phone : {data.org_phone}", header_style))
    
    elements.append(Spacer(1, 10))
    # Horizontal line
    elements.append(Table([['']], colWidths=['100%'], style=[
        ('LINEABOVE', (0,0), (-1,-1), 1.5, colors.HexColor('#555555')),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    elements.append(Spacer(1, 10))
    
    # 2. Customer Details
    purchaser_data = [
        [Paragraph('<b>Purchaser Name :</b>', details_label_style), Paragraph(data.provider_name, details_value_style)],
        [Paragraph('<b>GSTIN :</b>', details_label_style), Paragraph(data.provider_gstin, details_value_style)],
        [Paragraph('<b>Phone Number :</b>', details_label_style), Paragraph(data.provider_phone, details_value_style)],
    ]
    purchaser_table = Table(purchaser_data, colWidths=[120, 300])
    purchaser_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('TOPPADDING', (0,0), (-1,-1), 2),
    ]))
    elements.append(purchaser_table)
    elements.append(Spacer(1, 15))
    
    # 3. Date Range Box
    date_box_data = [[Paragraph(data.date_display_text, date_range_style)]]
    date_table = Table(date_box_data, colWidths=['100%'])
    date_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f2f2f2')),
        ('BORDER', (0,0), (-1,-1), 1, colors.HexColor('#bbbbbb')),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(date_table)
    elements.append(Spacer(1, 15))
    
    # 4. Item Table
    # Headers: Date, Bill No, Item Name, HSN, Qty, Rate, GST, Amount
    col_widths = [60, 60, 160, 50, 45, 60, 40, 75]
    table_data = []
    
    header_row = [
        "Date", "Bill No", "Item Name", "HSN", "Qty", "Rate", "GST", "Amount"
    ]
    table_data.append(header_row)
    
    total_qty = 0
    total_amount = 0.0
    
    # Tax aggregation map: { gst_rate: { taxable_value: 0, cgst: 0, sgst: 0 } }
    tax_summary = {}
    
    # Track row spans for Date and Bill No
    row_styles = []
    current_row_idx = 1 # 0 is header
    
    for bill in data.bills:
        bill_start_idx = current_row_idx
        num_items = len(bill.items)
        if num_items == 0:
            continue
            
        for i, item in enumerate(bill.items):
            # Formating
            rate_str = f"{item.rate:,.2f}"
            amount_str = f"{item.amount:,.2f}"
            qty_str = f"{item.qty} Nos"
            gst_str = f"{item.gst_percent:.0f}%"
            
            # Tax calculations
            cgst = (item.amount * item.gst_percent / 100) / 2
            sgst = (item.amount * item.gst_percent / 100) / 2
            
            if item.gst_percent not in tax_summary:
                tax_summary[item.gst_percent] = {'taxable': 0.0, 'cgst': 0.0, 'sgst': 0.0}
            tax_summary[item.gst_percent]['taxable'] += item.amount
            tax_summary[item.gst_percent]['cgst'] += cgst
            tax_summary[item.gst_percent]['sgst'] += sgst
            
            total_qty += item.qty
            total_amount += item.amount
            
            if i == 0:
                row = [
                    bill.date, 
                    Paragraph(f"<b>{bill.bill_no}</b>", styles['Normal']), 
                    Paragraph(f"<b>{item.item_name}</b>", styles['Normal']), 
                    item.hsn, 
                    qty_str, 
                    rate_str, 
                    gst_str, 
                    amount_str
                ]
            else:
                row = [
                    "", 
                    "", 
                    Paragraph(f"<b>{item.item_name}</b>", styles['Normal']), 
                    item.hsn, 
                    qty_str, 
                    rate_str, 
                    gst_str, 
                    amount_str
                ]
            table_data.append(row)
            
            # Add bottom border for the last item of a bill
            if i == num_items - 1:
                row_styles.append(('LINEBELOW', (0, current_row_idx), (-1, current_row_idx), 2, colors.HexColor('#777777')))
                
            current_row_idx += 1
            
        # Add SPAN for date and bill_no
        if num_items > 1:
            row_styles.append(('SPAN', (0, bill_start_idx), (0, bill_start_idx + num_items - 1)))
            row_styles.append(('SPAN', (1, bill_start_idx), (1, bill_start_idx + num_items - 1)))
            row_styles.append(('VALIGN', (0, bill_start_idx), (1, bill_start_idx + num_items - 1), 'TOP'))

    invoice_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    
    base_table_style = [
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#d9d9d9')),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 10),
        ('BOTTOMPADDING', (0,0), (-1,0), 8),
        ('TOPPADDING', (0,0), (-1,0), 8),
        ('BORDER', (0,0), (-1,0), 1, colors.HexColor('#999999')),
        
        ('ALIGN', (0,1), (-1,-1), 'CENTER'), # default center
        ('ALIGN', (2,1), (2,-1), 'LEFT'),    # Item name left
        ('ALIGN', (5,1), (5,-1), 'RIGHT'),   # Rate right
        ('ALIGN', (7,1), (7,-1), 'RIGHT'),   # Amount right
        
        ('VALIGN', (0,1), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,1), (-1,-1), 8),
        ('BOTTOMPADDING', (0,1), (-1,-1), 8),
        
        ('INNERGRID', (0,0), (-1,-1), 1, colors.HexColor('#cccccc')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#cccccc')),
    ]
    
    invoice_table.setStyle(TableStyle(base_table_style + row_styles))
    elements.append(invoice_table)
    
    # 5. Total Row
    total_row_data = [
        ["", "Total Qty", str(total_qty), f"Rs. {total_amount:,.2f}"]
    ]
    total_table = Table(total_row_data, colWidths=[col_widths[0]+col_widths[1]+col_widths[2]+col_widths[3], col_widths[4]+20, col_widths[5]-10, col_widths[6]+col_widths[7]-10])
    total_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#d9d9d9')),
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 11),
        ('ALIGN', (1,0), (1,0), 'RIGHT'),
        ('ALIGN', (2,0), (2,0), 'CENTER'),
        ('ALIGN', (3,0), (3,0), 'RIGHT'),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    elements.append(Spacer(1, 15))
    elements.append(total_table)
    elements.append(Spacer(1, 20))
    
    # 6. Tax Summary and Amount Summary Layout
    tax_headers = ["GST Rate", "Taxable Value", "CGST", "", "SGST", ""]
    tax_data_rows = [tax_headers]
    
    total_taxable = 0.0
    total_cgst = 0.0
    total_sgst = 0.0
    
    for rate, vals in tax_summary.items():
        tax_data_rows.append([
            f"{rate:.0f}%", 
            f"{vals['taxable']:,.2f}", 
            f"{rate/2:.1f}%", f"{vals['cgst']:,.2f}", 
            f"{rate/2:.1f}%", f"{vals['sgst']:,.2f}"
        ])
        total_taxable += vals['taxable']
        total_cgst += vals['cgst']
        total_sgst += vals['sgst']
        
    tax_data_rows.append([
        "Total", f"{total_taxable:,.2f}", "", f"{total_cgst:,.2f}", "", f"{total_sgst:,.2f}"
    ])
    
    tax_table = Table(tax_data_rows, colWidths=[55, 75, 30, 60, 30, 60])
    tax_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#d9d9d9')),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#d9d9d9')),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 1, colors.HexColor('#aaaaaa')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        # Span CGST and SGST headers
        ('SPAN', (2,0), (3,0)),
        ('SPAN', (4,0), (5,0)),
        # Span Total row empty cells
        ('SPAN', (2,-1), (3,-1)),
        ('SPAN', (4,-1), (5,-1)),
    ]))
    
    total_tax = total_cgst + total_sgst
    final_total = total_amount + total_tax
    
    amount_summary_data = [
        [Paragraph('<b>Subtotal</b>', styles['Normal']), Paragraph(f"<b>{total_amount:,.2f}</b>", ParagraphStyle('r', alignment=TA_RIGHT))],
        ["Add : CGST", Paragraph(f"{total_cgst:,.2f}", ParagraphStyle('r', alignment=TA_RIGHT))],
        ["Add : SGST", Paragraph(f"{total_sgst:,.2f}", ParagraphStyle('r', alignment=TA_RIGHT))],
        [Paragraph('<b>Total Tax</b>', styles['Normal']), Paragraph(f"<b>{total_tax:,.2f}</b>", ParagraphStyle('r', alignment=TA_RIGHT))],
    ]
    
    amount_table = Table(amount_summary_data, colWidths=[100, 100])
    amount_table.setStyle(TableStyle([
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
    ]))
    
    total_box_data = [
        [Paragraph('<b>Total Amount</b>', ParagraphStyle('l', fontName='Helvetica-Bold', fontSize=14)), 
         Paragraph(f"<b>Rs. {final_total:,.2f}</b>", ParagraphStyle('r', fontName='Helvetica-Bold', fontSize=14, alignment=TA_RIGHT))]
    ]
    total_box = Table(total_box_data, colWidths=[100, 100])
    total_box.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 2, colors.black),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    
    # Combine tax table and amount summary side by side
    bottom_layout_data = [
        [tax_table, "", Table([[amount_table], [total_box]])]
    ]
    bottom_layout = Table(bottom_layout_data, colWidths=[310, 20, 210])
    bottom_layout.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    
    elements.append(bottom_layout)
    
    doc.build(elements)
    buffer.seek(0)
    return buffer
