import sys
import pypdf
import pypdfium2 as pdfium
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import io
from PIL import Image

# 1. Create a 2-page PDF: Page 1 with text, Page 2 blank
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=letter)
c.setFont("Helvetica-Bold", 24)
text_p1 = "The quick brown fox jumps over the lazy dog. Client side Optical Character Recognition in PDF Studio."
# Draw text clearly on page 1 with proper wrapping
y = 700
lines = [
    "The quick brown fox jumps over the lazy dog.",
    "Client side Optical Character Recognition",
    "in PDF Studio toolkit."
]
for line in lines:
    c.drawString(50, y, line)
    y -= 45
c.showPage() # Page 1 done

# Page 2: Blank page
c.showPage() # Page 2 done
c.save()
original_pdf_bytes = buf.getvalue()

# 2. Rasterize Page 1 to an image, keeping Page 2 blank
pdf_doc = pdfium.PdfDocument(original_pdf_bytes)
img_p1 = pdf_doc[0].render(scale=3).to_pil() # 3x scale (~216 DPI)
img_buf = io.BytesIO()
img_p1.save(img_buf, format="PNG")
img_bytes = img_buf.getvalue()

from reportlab.lib.utils import ImageReader

# 3. Assemble into an image-only PDF
out_buf = io.BytesIO()
c2 = canvas.Canvas(out_buf, pagesize=(img_p1.width, img_p1.height))
c2.drawImage(ImageReader(img_p1), 0, 0, width=img_p1.width, height=img_p1.height)
c2.showPage()
# Page 2: completely blank
c2.showPage()
c2.save()

image_only_bytes = out_buf.getvalue()
with open("test/image_only_sample.pdf", "wb") as f:
    f.write(image_only_bytes)

print(f"Generated test/image_only_sample.pdf ({len(image_only_bytes)} bytes)")
print("Original text:", text_p1)
