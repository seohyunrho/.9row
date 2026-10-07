using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// Read thin, neutral table rules only. They are geometry, never a source of words.
public static class OcrTableGrid
{
    public static double[][] Read(string path)
    {
        using (var source = new Bitmap(path))
        using (var bitmap = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(bitmap)) graphics.DrawImage(source,
                new Rectangle(0, 0, source.Width, source.Height), 0, 0, source.Width, source.Height, GraphicsUnit.Pixel);
            int width = bitmap.Width, height = bitmap.Height;
            var data = bitmap.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] bytes = new byte[data.Stride * height];
            Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
            bitmap.UnlockBits(data);
            var rules = new List<double[]>();
            for (int axis = 0; axis < 2; axis++)
            {
                int across = axis == 0 ? height : width, along = axis == 0 ? width : height;
                int minimum = axis == 0 ? Math.Max(100, width / 5) : Math.Max(60, width / 20);
                for (int a = 0; a < across; a++)
                {
                    int start = -1, last = 0;
                    for (int b = 0; b <= along; b++)
                    {
                        int x = axis == 0 ? b : a, y = axis == 0 ? a : b;
                        bool neutral = false; int level = 0;
                        if (b < along)
                        {
                            int offset = y * data.Stride + x * 4;
                            int blue = bytes[offset], green = bytes[offset + 1], red = bytes[offset + 2];
                            level = (blue + green + red) / 3;
                            neutral = level >= 95 && level <= 235 && Math.Max(red, Math.Max(green, blue)) - Math.Min(red, Math.Min(green, blue)) <= 12;
                        }
                        if (!neutral || (start >= 0 && Math.Abs(level - last) > 12))
                        {
                            if (start >= 0 && b - start >= minimum)
                            {
                                double[] rule = axis == 0 ? new double[] { start, a, b - start, 1 } : new double[] { a, start, 1, b - start };
                                bool duplicate = rules.Exists(r => axis == 0
                                    ? r[3] <= 3 && Math.Abs(r[1] - a) <= 2 && Math.Abs(r[0] - start) <= 3 && Math.Abs(r[2] - (b - start)) <= 3
                                    : r[2] <= 3 && Math.Abs(r[0] - a) <= 2 && Math.Abs(r[1] - start) <= 3 && Math.Abs(r[3] - (b - start)) <= 3);
                                if (!duplicate) rules.Add(rule);
                                if (rules.Count >= 1000) return rules.ToArray();
                            }
                            start = neutral ? b : -1;
                        }
                        else if (start < 0) start = b;
                        last = level;
                    }
                }
            }
            return rules.ToArray();
        }
    }
}
