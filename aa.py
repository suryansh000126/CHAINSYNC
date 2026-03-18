from tkinter import *

x = Tk()
x.geometry("450x450")

# Labels
l = Label(text="NAME", fg="red", bg="green")
l.grid(row=1, column=1)

l1 = Label(text="FNAME")
l1.grid(row=2, column=1)

# Entry boxes
e = Entry()
e.grid(row=1, column=2)

e1 = Entry()
e1.grid(row=2, column=2)

# Buttons
b = Button(text="OK")
b.grid(row=3, column=1)

b1 = Button(text="Cancel")
b1.grid(row=3, column=2)

x.mainloop()