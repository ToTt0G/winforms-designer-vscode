using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Reflection;

namespace SWD4CS
{
    public partial class cls_user_datagridview : DataGridView
    {
        private cls_userform? form; cls_controls? cls_ctrl;
        // SetEventsData runs on every selection change - including once per mouse-move while a
        // control is dragged - so a duplicate wiring must only ever be reported once.
        private readonly HashSet<string> reportedDuplicates = new();
        public cls_user_datagridview()
        {
            this.DoubleBuffered = true;
            this.AllowUserToAddRows = false;
            this.CellMouseDoubleClick += new System.Windows.Forms.DataGridViewCellMouseEventHandler(cls_user_datagridview1_CellMouseDoubleClick);
        }

        internal void ShowEventList(bool flag, cls_userform form)
        {
            List<string> evnt = new();
            List<string> fnc = new();
            string[] split;
            this.form = form;
            this.cls_ctrl = null;

            for (int i = 0; i < form.decHandler.Count; i++)
            {
                split = form.decHandler[i].Split("+=")[0].Split(".");
                evnt.Add(split[^1].Trim());
                split = form.decFunc[i].Split("(")[0].Split(" ");
                fnc.Add(split[^1].Trim());
            }
            SetEventsData(flag, form, evnt, fnc);
        }

        internal void ShowEventList(bool flag, cls_controls ctrl)
        {
            List<string> evnt = new();
            List<string> fnc = new();
            string[] split;
            this.form = null;
            this.cls_ctrl = ctrl;

            for (int i = 0; i < ctrl.decHandler.Count; i++)
            {
                split = ctrl.decHandler[i].Split("+=")[0].Split(".");
                evnt.Add(split[^1].Trim());
                split = ctrl.decFunc[i].Split("(")[0].Split(" ");
                fnc.Add(split[^1].Trim());
            }

            Type type = ctrl.nonCtrl!.GetType();
            if (type == typeof(Component)) { SetEventsData(flag, ctrl.ctrl, evnt, fnc); }
            else { SetEventsData(flag, ctrl.nonCtrl, evnt, fnc); }
        }

        private void SetEventsData(bool flag, Component? comp, List<string> evnt, List<string> fnc)
        {
            DataTable table = new();
            List<string> duplicates = new();

            table.Columns.Add("Event");
            table.Columns.Add("Function");

            if (flag && comp != null)
            {
                Type type = comp.GetType();
                MemberInfo[] members = type.GetMembers();
                foreach (MemberInfo m in members)
                {
                    if (m.MemberType != MemberTypes.Event) { continue; }

                    List<string> handlers = new();
                    for (int i = 0; i < evnt.Count; i++)
                    {
                        if (evnt[i] == m.Name) { handlers.Add(fnc[i]); }
                    }

                    // A second "+=" on one event is invisible if only the first match is shown,
                    // and unwiring would delete just one of them, so report it instead.
                    if (handlers.Count > 1) { duplicates.Add(m.Name + " -> " + string.Join(", ", handlers)); }
                    table.Rows.Add(m.Name, handlers.Count > 0 ? handlers[0] : "");
                }
            }
            this.DataSource = table;
            this.Sort(this.Columns[0], System.ComponentModel.ListSortDirection.Ascending);
            this.Columns[0].ReadOnly = true;
            this.Columns[1].ReadOnly = true;
            this.Columns[0].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
            this.Columns[1].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;

            if (duplicates.Count == 0) { return; }

            // Keyed on the component and the duplicates themselves, so each distinct problem is
            // reported once and a re-selection of the same control stays silent.
            string key = (comp?.GetType().FullName ?? "") + "|" + (comp as Control)?.Name
                + "|" + string.Join(";", duplicates);

            if (this.reportedDuplicates.Add(key))
            {
                MessageBox.Show("These events are wired more than once in the designer file:"
                    + Environment.NewLine + string.Join(Environment.NewLine, duplicates)
                    + Environment.NewLine + Environment.NewLine
                    + "Only the first handler is shown here, and unwiring removes only that one."
                    + " Remove the extra \"+=\" lines by hand.",
                    "SWD4CS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void cls_user_datagridview1_CellMouseDoubleClick(object? sender, DataGridViewCellMouseEventArgs e)
        {
            // Column and row headers report -1, and this.Rows[-1] throws out of a WinForms
            // handler, i.e. an unhandled crash dialog.
            if (e.RowIndex < 0 || e.ColumnIndex < 0) { return; }

            Control? ctrl;
            bool mode = false;

            if (this.form != null) { ctrl = this.form; ctrl.Name = this.form.viewName; }
            else if (this.cls_ctrl != null)
            {
                ctrl = this.cls_ctrl.ctrl;
                if (this.cls_ctrl.nonCtrl != null && this.cls_ctrl.nonCtrl.GetType() != typeof(Component)) { mode = true; }
            }
            else { return; }

            if (ctrl == null) { return; }

            string? eventName = this.Rows[e.RowIndex].Cells[0].Value?.ToString();
            if (string.IsNullOrEmpty(eventName)) { return; }

            // The handler name as it is actually written in the designer file - it is only
            // "control_Event" for handlers this designer created itself.
            string existingHandler = this.Rows[e.RowIndex].Cells[1].Value?.ToString() ?? "";

            if (existingHandler.Length > 0)
            {
                if (Delete_Event(eventName, existingHandler)) { this.Rows[e.RowIndex].Cells[1].Value = ""; }
                else
                {
                    MessageBox.Show("Could not find the declaration for " + existingHandler
                        + "; the designer file may have been edited by hand.",
                        "SWD4CS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                return;
            }

            Type owner = mode && this.cls_ctrl?.nonCtrl != null ? this.cls_ctrl.nonCtrl.GetType() : ctrl.GetType();
            EventInfo? eventInfo = owner.GetEvent(eventName);
            Type? delegateType = eventInfo?.EventHandlerType;
            MethodInfo? invoke = delegateType?.GetMethod("Invoke");

            if (invoke == null || delegateType == null)
            {
                MessageBox.Show("The event " + eventName + " on " + owner.Name
                    + " cannot be wired up because its handler type is unavailable.",
                    "SWD4CS", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            string funcParam = "";
            string param = "";
            string funcName = ctrl.Name + "_" + eventName;
            string newHandler = "new " + CSharpTypeName(delegateType);

            SetArguments(ref funcParam, ref param, invoke.GetParameters());
            string decHandler = GetDecHandler(eventName, newHandler, funcName, ctrl.Name);
            string decFunc = "private void " + funcName + "(" + funcParam + ")";
            DeclarationAdd(decHandler, decFunc);
            this.Rows[e.RowIndex].Cells[1].Value = funcName;
        }

        private bool Delete_Event(string eventName, string handlerName)
        {
            var decFuncList = this.form != null ? this.form.decFunc : this.cls_ctrl!.decFunc;
            var decHandlerList = this.form != null ? this.form.decHandler : this.cls_ctrl!.decHandler;

            // The two lists are index-parallel; every read below relies on it.
            Debug.Assert(decFuncList.Count == decHandlerList.Count,
                "decFunc and decHandler must stay index-parallel");

            for (int i = 0; i < decFuncList.Count && i < decHandlerList.Count; i++)
            {
                string[] split = decFuncList[i].Split("(")[0].Split(" ");
                if (split[^1] != handlerName) { continue; }

                // The handler name alone is not a key: one method can be wired to
                // several events on the same control, which gives several identical
                // decFunc entries. Match the event on the "+=" line too, or we would
                // unwire whichever one happens to come first.
                if (EventNameOf(decHandlerList[i]) != eventName) { continue; }

                decHandlerList.RemoveAt(i);
                decFuncList.RemoveAt(i);
                return true;
            }
            return false;
        }

        /** "this.button1.Click += new EventHandler(...);" -> "Click". */
        private static string EventNameOf(string decHandler)
        {
            string[] split = decHandler.Split("+=")[0].Split(".");
            return split[^1].Trim();
        }

        private void DeclarationAdd(string decHandler, string decFunc)
        {
            if (this.form != null)
            {
                this.form!.decHandler.Add(decHandler);
                this.form.decFunc.Add(decFunc);
            }
            else
            {
                this.cls_ctrl!.decHandler.Add(decHandler);
                this.cls_ctrl.decFunc.Add(decFunc);
            }
        }

        private string GetDecHandler(string? eventName, string newHandler, string funcName, string ctrlName)
        {
            string prefix = form != null ? "this." : "this." + ctrlName + ".";
            return prefix + eventName + " += " + newHandler + "(" + funcName + ");";
        }

        private void SetArguments(ref string funcParam, ref string param, ParameterInfo[] pars)
        {
            foreach (ParameterInfo p in pars)
            {
                param = CSharpTypeName(p.ParameterType);
                if (p.ParameterType == typeof(object)) { param += "? sender"; }
                else { param += " e"; }
                if (funcParam == "") { funcParam = param; }
                else { funcParam += ", " + param; }
            }
        }

        // Type.ToString() emits runtime notation ("Outer+Inner", "List`1[System.Int32]") that is
        // not valid C#, and this text is written verbatim into the user's designer file.
        private static string CSharpTypeName(Type type)
        {
            Type? element = type.GetElementType();
            if (element != null)
            {
                string inner = CSharpTypeName(element);
                if (type.IsArray) { return inner + "[" + new string(',', type.GetArrayRank() - 1) + "]"; }
                if (type.IsPointer) { return inner + "*"; }
                return inner;   // by-ref: the "&" the runtime reports is not C# syntax
            }

            if (type.IsGenericParameter) { return type.Name; }

            Type[] args = type.GetGenericArguments();
            Type? declaring = type.IsNested ? type.DeclaringType : null;

            // A nested type also reports its declaring type's arguments: the leading ones belong
            // to the outer type ("Outer<int>.Inner"), only the rest to this level.
            int inherited = declaring != null ? declaring.GetGenericArguments().Length : 0;
            if (declaring != null && inherited > 0 && inherited <= args.Length && declaring.IsGenericTypeDefinition)
            {
                Type[] outerArgs = new Type[inherited];
                Array.Copy(args, outerArgs, inherited);
                declaring = declaring.MakeGenericType(outerArgs);
            }

            string name = declaring != null
                ? CSharpTypeName(declaring) + "."
                : (string.IsNullOrEmpty(type.Namespace) ? "" : type.Namespace + ".");

            name += StripGenericArity(type.Name);

            if (args.Length > inherited)
            {
                string[] own = new string[args.Length - inherited];
                for (int i = 0; i < own.Length; i++) { own[i] = CSharpTypeName(args[inherited + i]); }
                name += "<" + string.Join(", ", own) + ">";
            }
            return name;
        }

        private static string StripGenericArity(string name)
        {
            int tick = name.IndexOf('`');
            return tick < 0 ? name : name.Substring(0, tick);
        }
    }
}
