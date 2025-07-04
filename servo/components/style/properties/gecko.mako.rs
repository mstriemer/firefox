/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// `data` comes from components/style/properties.mako.rs; see build.rs for more details.

<%!
    from data import to_camel_case, to_camel_case_lower
    from data import Keyword
%>
<%namespace name="helpers" file="/helpers.mako.rs" />

use crate::Atom;
use app_units::Au;
use crate::computed_value_flags::*;
use crate::custom_properties::ComputedCustomProperties;
use crate::gecko_bindings::bindings;
% for style_struct in data.style_structs:
use crate::gecko_bindings::bindings::Gecko_Construct_Default_${style_struct.gecko_ffi_name};
use crate::gecko_bindings::bindings::Gecko_CopyConstruct_${style_struct.gecko_ffi_name};
use crate::gecko_bindings::bindings::Gecko_Destroy_${style_struct.gecko_ffi_name};
% endfor
use crate::gecko_bindings::bindings::Gecko_EnsureImageLayersLength;
use crate::gecko_bindings::bindings::Gecko_nsStyleFont_SetLang;
use crate::gecko_bindings::bindings::Gecko_nsStyleFont_CopyLangFrom;
use crate::gecko_bindings::structs;
use crate::gecko_bindings::structs::mozilla::PseudoStyleType;
use crate::gecko::data::PerDocumentStyleData;
use crate::logical_geometry::WritingMode;
use crate::media_queries::Device;
use crate::properties::longhands;
use crate::rule_tree::StrongRuleNode;
use crate::selector_parser::PseudoElement;
use servo_arc::{Arc, UniqueArc};
use std::mem::{forget, MaybeUninit, ManuallyDrop};
use std::{ops, ptr};
use crate::values;
use crate::values::computed::{BorderStyle, Time, Zoom};
use crate::values::computed::font::FontSize;


pub mod style_structs {
    % for style_struct in data.style_structs:
    pub use super::${style_struct.gecko_struct_name} as ${style_struct.name};

    unsafe impl Send for ${style_struct.name} {}
    unsafe impl Sync for ${style_struct.name} {}
    % endfor
}

/// FIXME(emilio): This is completely duplicated with the other properties code.
pub type ComputedValuesInner = structs::ServoComputedData;

#[repr(C)]
pub struct ComputedValues(structs::mozilla::ComputedStyle);

impl ComputedValues {
    #[inline]
    pub (crate) fn as_gecko_computed_style(&self) -> &structs::ComputedStyle {
        &self.0
    }

    pub fn new(
        pseudo: Option<&PseudoElement>,
        custom_properties: ComputedCustomProperties,
        writing_mode: WritingMode,
        effective_zoom: Zoom,
        flags: ComputedValueFlags,
        rules: Option<StrongRuleNode>,
        visited_style: Option<Arc<ComputedValues>>,
        % for style_struct in data.style_structs:
        ${style_struct.ident}: Arc<style_structs::${style_struct.name}>,
        % endfor
    ) -> Arc<Self> {
        ComputedValuesInner::new(
            custom_properties,
            writing_mode,
            effective_zoom,
            flags,
            rules,
            visited_style,
            % for style_struct in data.style_structs:
            ${style_struct.ident},
            % endfor
        ).to_outer(pseudo)
    }

    pub fn default_values(doc: &structs::Document) -> Arc<Self> {
        ComputedValuesInner::new(
            ComputedCustomProperties::default(),
            WritingMode::empty(), // FIXME(bz): This seems dubious
            Zoom::ONE,
            ComputedValueFlags::empty(),
            /* rules = */ None,
            /* visited_style = */ None,
            % for style_struct in data.style_structs:
            style_structs::${style_struct.name}::default(doc),
            % endfor
        ).to_outer(None)
    }

    /// Converts the computed values to an Arc<> from a reference.
    pub fn to_arc(&self) -> Arc<Self> {
        // SAFETY: We're guaranteed to be allocated as an Arc<> since the
        // functions above are the only ones that create ComputedValues
        // instances in Gecko (and that must be the case since ComputedValues'
        // member is private).
        unsafe { Arc::from_raw_addrefed(self) }
    }

    #[inline]
    pub fn is_pseudo_style(&self) -> bool {
        self.0.mPseudoType != PseudoStyleType::NotPseudo
    }

    #[inline]
    pub fn pseudo(&self) -> Option<PseudoElement> {
        if !self.is_pseudo_style() {
            return None;
        }
        PseudoElement::from_pseudo_type(self.0.mPseudoType, None)
    }

    #[inline]
    pub fn is_first_line_style(&self) -> bool {
        self.pseudo() == Some(PseudoElement::FirstLine)
    }

    /// Returns true if the display property is changed from 'none' to others.
    pub fn is_display_property_changed_from_none(
        &self,
        old_values: Option<&ComputedValues>
    ) -> bool {
        use crate::properties::longhands::display::computed_value::T as Display;

        old_values.map_or(false, |old| {
            let old_display_style = old.get_box().clone_display();
            let new_display_style = self.get_box().clone_display();
            old_display_style == Display::None &&
            new_display_style != Display::None
        })
    }

}

impl Drop for ComputedValues {
    fn drop(&mut self) {
        // XXX this still relies on the destructor of ComputedValuesInner to run on the rust side,
        // that's pretty wild.
        unsafe {
            bindings::Gecko_ComputedStyle_Destroy(&mut self.0);
        }
    }
}

unsafe impl Sync for ComputedValues {}
unsafe impl Send for ComputedValues {}

impl Clone for ComputedValues {
    fn clone(&self) -> Self {
        unreachable!()
    }
}

impl Clone for ComputedValuesInner {
    fn clone(&self) -> Self {
        ComputedValuesInner {
            % for style_struct in data.style_structs:
            ${style_struct.gecko_name}: Arc::into_raw(unsafe { Arc::from_raw_addrefed(self.${style_struct.name_lower}_ptr()) }) as *const _,
            % endfor
            custom_properties: self.custom_properties.clone(),
            writing_mode: self.writing_mode.clone(),
            flags: self.flags.clone(),
            effective_zoom: self.effective_zoom,
            rules: self.rules.clone(),
            visited_style: if self.visited_style.is_null() {
                ptr::null()
            } else {
                Arc::into_raw(unsafe { Arc::from_raw_addrefed(self.visited_style_ptr()) }) as *const _
            },
        }
    }
}


impl Drop for ComputedValuesInner {
    fn drop(&mut self) {
        % for style_struct in data.style_structs:
        let _ = unsafe { Arc::from_raw(self.${style_struct.name_lower}_ptr()) };
        % endfor
        if !self.visited_style.is_null() {
            let _ = unsafe { Arc::from_raw(self.visited_style_ptr()) };
        }
    }
}

impl ComputedValuesInner {
    pub fn new(
        custom_properties: ComputedCustomProperties,
        writing_mode: WritingMode,
        effective_zoom: Zoom,
        flags: ComputedValueFlags,
        rules: Option<StrongRuleNode>,
        visited_style: Option<Arc<ComputedValues>>,
        % for style_struct in data.style_structs:
        ${style_struct.ident}: Arc<style_structs::${style_struct.name}>,
        % endfor
    ) -> Self {
        Self {
            custom_properties,
            writing_mode,
            rules,
            visited_style: visited_style.map_or(ptr::null(), |p| Arc::into_raw(p)) as *const _,
            flags,
            effective_zoom,
            % for style_struct in data.style_structs:
            ${style_struct.gecko_name}: Arc::into_raw(${style_struct.ident}) as *const _,
            % endfor
        }
    }

    fn to_outer(self, pseudo: Option<&PseudoElement>) -> Arc<ComputedValues> {
        let pseudo_ty = match pseudo {
            Some(p) => p.pseudo_type_and_argument().0,
            None => structs::PseudoStyleType::NotPseudo,
        };
        unsafe {
            let mut arc = UniqueArc::<ComputedValues>::new_uninit();
            bindings::Gecko_ComputedStyle_Init(
                arc.as_mut_ptr() as *mut _,
                &self,
                pseudo_ty,
            );
            // We're simulating move semantics by having C++ do a memcpy and
            // then forgetting it on this end.
            forget(self);
            UniqueArc::assume_init(arc).shareable()
        }
    }
}

impl ops::Deref for ComputedValues {
    type Target = ComputedValuesInner;
    #[inline]
    fn deref(&self) -> &ComputedValuesInner {
        &self.0.mSource
    }
}

impl ops::DerefMut for ComputedValues {
    #[inline]
    fn deref_mut(&mut self) -> &mut ComputedValuesInner {
        &mut self.0.mSource
    }
}

impl ComputedValuesInner {
    /// Returns true if the value of the `content` property would make a
    /// pseudo-element not rendered.
    #[inline]
    pub fn ineffective_content_property(&self) -> bool {
        self.get_counters().ineffective_content_property()
    }

    #[inline]
    fn visited_style_ptr(&self) -> *const ComputedValues {
        self.visited_style as *const _
    }

    /// Returns the visited style, if any.
    pub fn visited_style(&self) -> Option<&ComputedValues> {
        unsafe { self.visited_style_ptr().as_ref() }
    }

    % for style_struct in data.style_structs:
    #[inline]
    fn ${style_struct.name_lower}_ptr(&self) -> *const style_structs::${style_struct.name} {
        // This is sound because the wrapper we create is repr(transparent).
        self.${style_struct.gecko_name} as *const _
    }

    #[inline]
    pub fn clone_${style_struct.name_lower}(&self) -> Arc<style_structs::${style_struct.name}> {
        unsafe { Arc::from_raw_addrefed(self.${style_struct.name_lower}_ptr()) }
    }
    #[inline]
    pub fn get_${style_struct.name_lower}(&self) -> &style_structs::${style_struct.name} {
        unsafe { &*self.${style_struct.name_lower}_ptr() }
    }

    #[inline]
    pub fn mutate_${style_struct.name_lower}(&mut self) -> &mut style_structs::${style_struct.name} {
        unsafe {
            let mut arc = Arc::from_raw(self.${style_struct.name_lower}_ptr());
            let ptr = Arc::make_mut(&mut arc) as *mut _;
            // Sound for the same reason _ptr() is sound.
            self.${style_struct.gecko_name} = Arc::into_raw(arc) as *const _;
            &mut *ptr
        }
    }
    % endfor
}

<%def name="impl_simple_setter(ident, gecko_ffi_name)">
    #[allow(non_snake_case)]
    pub fn set_${ident}(&mut self, v: longhands::${ident}::computed_value::T) {
        ${set_gecko_property(gecko_ffi_name, "From::from(v)")}
    }
</%def>

<%def name="impl_simple_clone(ident, gecko_ffi_name)">
    #[allow(non_snake_case)]
    pub fn clone_${ident}(&self) -> longhands::${ident}::computed_value::T {
        From::from(self.${gecko_ffi_name}.clone())
    }
</%def>

<%def name="impl_simple_copy(ident, gecko_ffi_name, *kwargs)">
    #[allow(non_snake_case)]
    pub fn copy_${ident}_from(&mut self, other: &Self) {
        self.${gecko_ffi_name} = other.${gecko_ffi_name}.clone();
    }

    #[allow(non_snake_case)]
    pub fn reset_${ident}(&mut self, other: &Self) {
        self.copy_${ident}_from(other)
    }
</%def>

<%!
def get_gecko_property(ffi_name, self_param = "self"):
    return "%s.%s" % (self_param, ffi_name)

def set_gecko_property(ffi_name, expr):
    return "self.%s = %s;" % (ffi_name, expr)
%>

<%def name="impl_keyword_setter(ident, gecko_ffi_name, keyword, cast_type='u8')">
    #[allow(non_snake_case)]
    pub fn set_${ident}(&mut self, v: longhands::${ident}::computed_value::T) {
        use crate::properties::longhands::${ident}::computed_value::T as Keyword;
        // FIXME(bholley): Align binary representations and ditch |match| for cast + static_asserts
        let result = match v {
            % for value in keyword.values_for('gecko'):
                Keyword::${to_camel_case(value)} =>
                    structs::${keyword.gecko_constant(value)} ${keyword.maybe_cast(cast_type)},
            % endfor
        };
        ${set_gecko_property(gecko_ffi_name, "result")}
    }
</%def>

<%def name="impl_keyword_clone(ident, gecko_ffi_name, keyword, cast_type='u8')">
    #[allow(non_snake_case)]
    pub fn clone_${ident}(&self) -> longhands::${ident}::computed_value::T {
        use crate::properties::longhands::${ident}::computed_value::T as Keyword;
        // FIXME(bholley): Align binary representations and ditch |match| for cast + static_asserts

        // Some constant macros in the gecko are defined as negative integer(e.g. font-stretch).
        // And they are convert to signed integer in Rust bindings. We need to cast then
        // as signed type when we have both signed/unsigned integer in order to use them
        // as match's arms.
        // Also, to use same implementation here we use casted constant if we have only singed values.
        % if keyword.gecko_enum_prefix is None:
        % for value in keyword.values_for('gecko'):
        const ${keyword.casted_constant_name(value, cast_type)} : ${cast_type} =
            structs::${keyword.gecko_constant(value)} as ${cast_type};
        % endfor

        match ${get_gecko_property(gecko_ffi_name)} as ${cast_type} {
            % for value in keyword.values_for('gecko'):
            ${keyword.casted_constant_name(value, cast_type)} => Keyword::${to_camel_case(value)},
            % endfor
            % if keyword.gecko_inexhaustive:
            _ => panic!("Found unexpected value in style struct for ${ident} property"),
            % endif
        }
        % else:
        match ${get_gecko_property(gecko_ffi_name)} {
            % for value in keyword.values_for('gecko'):
            structs::${keyword.gecko_constant(value)} => Keyword::${to_camel_case(value)},
            % endfor
            % if keyword.gecko_inexhaustive:
            _ => panic!("Found unexpected value in style struct for ${ident} property"),
            % endif
        }
        % endif
    }
</%def>

<%def name="impl_keyword(ident, gecko_ffi_name, keyword, cast_type='u8', **kwargs)">
<%call expr="impl_keyword_setter(ident, gecko_ffi_name, keyword, cast_type, **kwargs)"></%call>
<%call expr="impl_simple_copy(ident, gecko_ffi_name, **kwargs)"></%call>
<%call expr="impl_keyword_clone(ident, gecko_ffi_name, keyword, cast_type)"></%call>
</%def>

<%def name="impl_simple(ident, gecko_ffi_name)">
<%call expr="impl_simple_setter(ident, gecko_ffi_name)"></%call>
<%call expr="impl_simple_copy(ident, gecko_ffi_name)"></%call>
<%call expr="impl_simple_clone(ident, gecko_ffi_name)"></%call>
</%def>

<%def name="impl_border_width(ident, gecko_ffi_name, inherit_from)">
    #[allow(non_snake_case)]
    pub fn set_${ident}(&mut self, v: Au) {
        let value = v.0;
        self.${inherit_from} = value;
        self.${gecko_ffi_name} = value;
    }

    #[allow(non_snake_case)]
    pub fn copy_${ident}_from(&mut self, other: &Self) {
        self.${inherit_from} = other.${inherit_from};
        // NOTE: This is needed to easily handle the `unset` and `initial`
        // keywords, which are implemented calling this function.
        //
        // In practice, this means that we may have an incorrect value here, but
        // we'll adjust that properly in the style fixup phase.
        //
        // FIXME(emilio): We could clean this up a bit special-casing the reset_
        // function below.
        self.${gecko_ffi_name} = other.${inherit_from};
    }

    #[allow(non_snake_case)]
    pub fn reset_${ident}(&mut self, other: &Self) {
        self.copy_${ident}_from(other)
    }

    #[allow(non_snake_case)]
    pub fn clone_${ident}(&self) -> Au {
        Au(self.${gecko_ffi_name})
    }
</%def>

<%def name="impl_style_struct(style_struct)">
/// A wrapper for ${style_struct.gecko_ffi_name}, to be able to manually construct / destruct /
/// clone it.
#[repr(transparent)]
pub struct ${style_struct.gecko_struct_name}(ManuallyDrop<structs::${style_struct.gecko_ffi_name}>);

impl ops::Deref for ${style_struct.gecko_struct_name} {
    type Target = structs::${style_struct.gecko_ffi_name};
    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl ops::DerefMut for ${style_struct.gecko_struct_name} {
    #[inline]
    fn deref_mut(&mut self) -> &mut <Self as ops::Deref>::Target {
        &mut self.0
    }
}

impl ${style_struct.gecko_struct_name} {
    #[allow(dead_code, unused_variables)]
    pub fn default(document: &structs::Document) -> Arc<Self> {
% if style_struct.document_dependent:
        unsafe {
            let mut result = UniqueArc::<Self>::new_uninit();
            Gecko_Construct_Default_${style_struct.gecko_ffi_name}(
                result.as_mut_ptr() as *mut _,
                document,
            );
            UniqueArc::assume_init(result).shareable()
        }
% else:
        lazy_static! {
            static ref DEFAULT: Arc<${style_struct.gecko_struct_name}> = unsafe {
                let mut result = UniqueArc::<${style_struct.gecko_struct_name}>::new_uninit();
                Gecko_Construct_Default_${style_struct.gecko_ffi_name}(
                    result.as_mut_ptr() as *mut _,
                    std::ptr::null(),
                );
                let arc = UniqueArc::assume_init(result).shareable();
                arc.mark_as_intentionally_leaked();
                arc
            };
        };
        DEFAULT.clone()
% endif
    }
}

impl Drop for ${style_struct.gecko_struct_name} {
    fn drop(&mut self) {
        unsafe {
            Gecko_Destroy_${style_struct.gecko_ffi_name}(&mut **self);
        }
    }
}
impl Clone for ${style_struct.gecko_struct_name} {
    fn clone(&self) -> Self {
        unsafe {
            let mut result = MaybeUninit::<Self>::uninit();
            // FIXME(bug 1595895): Zero the memory to keep valgrind happy, but
            // these looks like Valgrind false-positives at a quick glance.
            ptr::write_bytes::<Self>(result.as_mut_ptr(), 0, 1);
            Gecko_CopyConstruct_${style_struct.gecko_ffi_name}(result.as_mut_ptr() as *mut _, &**self);
            result.assume_init()
        }
    }
}
</%def>

<%def name="impl_font_settings(ident, gecko_type, tag_type, value_type, gecko_value_type)">
    <% gecko_ffi_name = to_camel_case_lower(ident) %>

    pub fn set_${ident}(&mut self, v: longhands::${ident}::computed_value::T) {
        let iter = v.0.iter().map(|other| structs::${gecko_type} {
            mTag: other.tag.0,
            mValue: other.value as ${gecko_value_type},
        });
        self.mFont.${gecko_ffi_name}.clear();
        self.mFont.${gecko_ffi_name}.extend(iter);
    }

    <% impl_simple_copy(ident, "mFont." + gecko_ffi_name) %>

    pub fn clone_${ident}(&self) -> longhands::${ident}::computed_value::T {
        use crate::values::generics::font::{FontSettings, FontTag, ${tag_type}};

        FontSettings(
            self.mFont.${gecko_ffi_name}.iter().map(|gecko_font_setting| {
                ${tag_type} {
                    tag: FontTag(gecko_font_setting.mTag),
                    value: gecko_font_setting.mValue as ${value_type},
                }
            }).collect()
        )
    }
</%def>

<%def name="impl_trait(style_struct_name, skip_longhands='')">
<%
    style_struct = next(x for x in data.style_structs if x.name == style_struct_name)
    longhands = [x for x in style_struct.longhands
                if not (skip_longhands == "*" or x.name in skip_longhands.split())]

    def longhand_method(longhand):
        args = dict(ident=longhand.ident, gecko_ffi_name=longhand.gecko_ffi_name)

        if longhand.logical:
            return
        # get the method and pass additional keyword or type-specific arguments
        if longhand.keyword:
            method = impl_keyword
            args.update(keyword=longhand.keyword)
            if "font" in longhand.ident:
                args.update(cast_type=longhand.cast_type)
        else:
            method = impl_simple

        method(**args)
%>
impl ${style_struct.gecko_struct_name} {
    /*
     * Manually-Implemented Methods.
     */
    ${caller.body().strip()}

    /*
     * Auto-Generated Methods.
     */
    <%
    for longhand in longhands:
        longhand_method(longhand)
    %>
}
</%def>

<%!
class Side(object):
    def __init__(self, name, index):
        self.name = name
        self.ident = name.lower()
        self.index = index

SIDES = [Side("Top", 0), Side("Right", 1), Side("Bottom", 2), Side("Left", 3)]
%>

#[allow(dead_code)]
fn static_assert() {
    // Note: using the above technique with an enum hits a rust bug when |structs| is in a different crate.
    % for side in SIDES:
    { const DETAIL: u32 = [0][(structs::Side::eSide${side.name} as usize != ${side.index}) as usize]; let _ = DETAIL; }
    % endfor
}


<% skip_border_longhands = " ".join(["border-{0}-{1}".format(x.ident, y)
                                     for x in SIDES
                                     for y in ["style", "width"]]) %>

<%self:impl_trait style_struct_name="Border"
                  skip_longhands="${skip_border_longhands}">
    % for side in SIDES:
    pub fn set_border_${side.ident}_style(&mut self, v: BorderStyle) {
        self.mBorderStyle[${side.index}] = v;

        // This is needed because the initial mComputedBorder value is set to
        // zero.
        //
        // In order to compute stuff, we start from the initial struct, and keep
        // going down the tree applying properties.
        //
        // That means, effectively, that when we set border-style to something
        // non-hidden, we should use the initial border instead.
        //
        // Servo stores the initial border-width in the initial struct, and then
        // adjusts as needed in the fixup phase. This means that the initial
        // struct is technically not valid without fixups, and that you lose
        // pretty much any sharing of the initial struct, which is kind of
        // unfortunate.
        //
        // Gecko has two fields for this, one that stores the "specified"
        // border, and other that stores the actual computed one. That means
        // that when we set border-style, border-width may change and we need to
        // sync back to the specified one. This is what this function does.
        //
        // Note that this doesn't impose any dependency in the order of
        // computation of the properties. This is only relevant if border-style
        // is specified, but border-width isn't. If border-width is specified at
        // some point, the two mBorder and mComputedBorder fields would be the
        // same already.
        //
        // Once we're here, we know that we'll run style fixups, so it's fine to
        // just copy the specified border here, we'll adjust it if it's
        // incorrect later.
        self.mComputedBorder.${side.ident} = self.mBorder.${side.ident};
    }

    pub fn copy_border_${side.ident}_style_from(&mut self, other: &Self) {
        self.set_border_${side.ident}_style(other.mBorderStyle[${side.index}]);
    }

    pub fn reset_border_${side.ident}_style(&mut self, other: &Self) {
        self.copy_border_${side.ident}_style_from(other);
    }

    #[inline]
    pub fn clone_border_${side.ident}_style(&self) -> BorderStyle {
        self.mBorderStyle[${side.index}]
    }

    ${impl_border_width("border_%s_width" % side.ident, "mComputedBorder.%s" % side.ident, "mBorder.%s" % side.ident)}

    pub fn border_${side.ident}_has_nonzero_width(&self) -> bool {
        self.mComputedBorder.${side.ident} != 0
    }
    % endfor
</%self:impl_trait>

<%self:impl_trait style_struct_name="Margin"></%self:impl_trait>
<%self:impl_trait style_struct_name="Padding"></%self:impl_trait>
<%self:impl_trait style_struct_name="Page"></%self:impl_trait>

<%self:impl_trait style_struct_name="Position">
    pub fn set_computed_justify_items(&mut self, v: values::specified::JustifyItems) {
        debug_assert_ne!(v.0, crate::values::specified::align::AlignFlags::LEGACY);
        self.mJustifyItems.computed = v;
    }
</%self:impl_trait>

<%self:impl_trait style_struct_name="Outline"
                  skip_longhands="outline-style outline-width">

    pub fn set_outline_style(&mut self, v: longhands::outline_style::computed_value::T) {
        self.mOutlineStyle = v;
        // NB: This is needed to correctly handling the initial value of
        // outline-width when outline-style changes, see the
        // update_border_${side.ident} comment for more details.
        self.mActualOutlineWidth = self.mOutlineWidth;
    }

    pub fn copy_outline_style_from(&mut self, other: &Self) {
        self.set_outline_style(other.mOutlineStyle);
    }

    pub fn reset_outline_style(&mut self, other: &Self) {
        self.copy_outline_style_from(other)
    }

    pub fn clone_outline_style(&self) -> longhands::outline_style::computed_value::T {
        self.mOutlineStyle.clone()
    }

    ${impl_border_width("outline_width", "mActualOutlineWidth", "mOutlineWidth")}

    pub fn outline_has_nonzero_width(&self) -> bool {
        self.mActualOutlineWidth != 0
    }
</%self:impl_trait>

<% skip_font_longhands = """font-size -x-lang font-feature-settings font-variation-settings""" %>
<%self:impl_trait style_struct_name="Font"
    skip_longhands="${skip_font_longhands}">

    // Negative numbers are invalid at parse time, but <integer> is still an
    // i32.
    <% impl_font_settings("font_feature_settings", "gfxFontFeature", "FeatureTagValue", "i32", "u32") %>
    <% impl_font_settings("font_variation_settings", "gfxFontVariation", "VariationValue", "f32", "f32") %>

    pub fn unzoom_fonts(&mut self, device: &Device) {
        use crate::values::generics::NonNegative;
        self.mSize = NonNegative(device.unzoom_text(self.mSize.0));
        self.mScriptUnconstrainedSize = NonNegative(device.unzoom_text(self.mScriptUnconstrainedSize.0));
        self.mFont.size = NonNegative(device.unzoom_text(self.mFont.size.0));
    }

    pub fn copy_font_size_from(&mut self, other: &Self) {
        self.mScriptUnconstrainedSize = other.mScriptUnconstrainedSize;

        self.mSize = other.mScriptUnconstrainedSize;
        // NOTE: Intentionally not copying from mFont.size. The cascade process
        // recomputes the used size as needed.
        self.mFont.size = other.mSize;
        self.mFontSizeKeyword = other.mFontSizeKeyword;

        // TODO(emilio): Should we really copy over these two?
        self.mFontSizeFactor = other.mFontSizeFactor;
        self.mFontSizeOffset = other.mFontSizeOffset;
    }

    pub fn reset_font_size(&mut self, other: &Self) {
        self.copy_font_size_from(other)
    }

    pub fn set_font_size(&mut self, v: FontSize) {
        let computed_size = v.computed_size;
        self.mScriptUnconstrainedSize = computed_size;

        // These two may be changed from Cascade::fixup_font_stuff.
        self.mSize = computed_size;
        // NOTE: Intentionally not copying from used_size. The cascade process
        // recomputes the used size as needed.
        self.mFont.size = computed_size;

        self.mFontSizeKeyword = v.keyword_info.kw;
        self.mFontSizeFactor = v.keyword_info.factor;
        self.mFontSizeOffset = v.keyword_info.offset;
    }

    pub fn clone_font_size(&self) -> FontSize {
        use crate::values::specified::font::KeywordInfo;

        FontSize {
            computed_size: self.mSize,
            used_size: self.mFont.size,
            keyword_info: KeywordInfo {
                kw: self.mFontSizeKeyword,
                factor: self.mFontSizeFactor,
                offset: self.mFontSizeOffset,
            }
        }
    }

    #[allow(non_snake_case)]
    pub fn set__x_lang(&mut self, v: longhands::_x_lang::computed_value::T) {
        let ptr = v.0.as_ptr();
        forget(v);
        unsafe {
            Gecko_nsStyleFont_SetLang(&mut **self, ptr);
        }
    }

    #[allow(non_snake_case)]
    pub fn copy__x_lang_from(&mut self, other: &Self) {
        unsafe {
            Gecko_nsStyleFont_CopyLangFrom(&mut **self, &**other);
        }
    }

    #[allow(non_snake_case)]
    pub fn reset__x_lang(&mut self, other: &Self) {
        self.copy__x_lang_from(other)
    }

    #[allow(non_snake_case)]
    pub fn clone__x_lang(&self) -> longhands::_x_lang::computed_value::T {
        longhands::_x_lang::computed_value::T(unsafe {
            Atom::from_raw(self.mLanguage.mRawPtr)
        })
    }
</%self:impl_trait>

<%def name="impl_coordinated_property_copy(type, ident, gecko_ffi_name)">
    #[allow(non_snake_case)]
    pub fn copy_${type}_${ident}_from(&mut self, other: &Self) {
        self.m${to_camel_case(type)}s.ensure_len(other.m${to_camel_case(type)}s.len());

        let count = other.m${to_camel_case(type)}${gecko_ffi_name}Count;
        self.m${to_camel_case(type)}${gecko_ffi_name}Count = count;

        let iter = self.m${to_camel_case(type)}s.iter_mut().take(count as usize).zip(
            other.m${to_camel_case(type)}s.iter()
        );

        for (ours, others) in iter {
            ours.m${gecko_ffi_name} = others.m${gecko_ffi_name}.clone();
        }
    }
    #[allow(non_snake_case)]
    pub fn reset_${type}_${ident}(&mut self, other: &Self) {
        self.copy_${type}_${ident}_from(other)
    }
</%def>

<%def name="impl_coordinated_property_count(type, ident, gecko_ffi_name)">
    #[allow(non_snake_case)]
    pub fn ${type}_${ident}_count(&self) -> usize {
        self.m${to_camel_case(type)}${gecko_ffi_name}Count as usize
    }
</%def>

<%def name="impl_coordinated_property(type, ident, gecko_ffi_name)">
    #[allow(non_snake_case)]
    pub fn set_${type}_${ident}<I>(&mut self, v: I)
    where
        I: IntoIterator<Item = longhands::${type}_${ident}::computed_value::single_value::T>,
        I::IntoIter: ExactSizeIterator + Clone
    {
        let v = v.into_iter();
        debug_assert_ne!(v.len(), 0);
        let input_len = v.len();
        self.m${to_camel_case(type)}s.ensure_len(input_len);

        self.m${to_camel_case(type)}${gecko_ffi_name}Count = input_len as u32;
        for (gecko, servo) in self.m${to_camel_case(type)}s.iter_mut().take(input_len as usize).zip(v) {
            gecko.m${gecko_ffi_name} = servo;
        }
    }
    #[allow(non_snake_case)]
    pub fn ${type}_${ident}_at(&self, index: usize)
        -> longhands::${type}_${ident}::computed_value::SingleComputedValue {
        self.m${to_camel_case(type)}s[index % self.${type}_${ident}_count()].m${gecko_ffi_name}.clone()
    }
    ${impl_coordinated_property_copy(type, ident, gecko_ffi_name)}
    ${impl_coordinated_property_count(type, ident, gecko_ffi_name)}
</%def>

<% skip_box_longhands= """display contain""" %>
<%self:impl_trait style_struct_name="Box" skip_longhands="${skip_box_longhands}">
    #[inline]
    pub fn set_display(&mut self, v: longhands::display::computed_value::T) {
        self.mDisplay = v;
        self.mOriginalDisplay = v;
    }

    #[inline]
    pub fn copy_display_from(&mut self, other: &Self) {
        self.set_display(other.mDisplay);
    }

    #[inline]
    pub fn reset_display(&mut self, other: &Self) {
        self.copy_display_from(other)
    }

    #[inline]
    pub fn set_adjusted_display(
        &mut self,
        v: longhands::display::computed_value::T,
        _is_item_or_root: bool
    ) {
        self.mDisplay = v;
    }

    #[inline]
    pub fn clone_display(&self) -> longhands::display::computed_value::T {
        self.mDisplay
    }

    #[inline]
    pub fn set_contain(&mut self, v: longhands::contain::computed_value::T) {
        self.mContain = v;
        self.mEffectiveContainment = v;
    }

    #[inline]
    pub fn copy_contain_from(&mut self, other: &Self) {
        self.set_contain(other.mContain);
    }

    #[inline]
    pub fn reset_contain(&mut self, other: &Self) {
        self.copy_contain_from(other)
    }

    #[inline]
    pub fn clone_contain(&self) -> longhands::contain::computed_value::T {
        self.mContain
    }

    #[inline]
    pub fn set_effective_containment(
        &mut self,
        v: longhands::contain::computed_value::T
    ) {
        self.mEffectiveContainment = v;
    }

    #[inline]
    pub fn clone_effective_containment(&self) -> longhands::contain::computed_value::T {
        self.mEffectiveContainment
    }
</%self:impl_trait>

<%def name="simple_image_array_property(name, shorthand, field_name)">
    <%
        image_layers_field = "mImage" if shorthand == "background" else "mMask"
        copy_simple_image_array_property(name, shorthand, image_layers_field, field_name)
    %>

    pub fn set_${shorthand}_${name}<I>(&mut self, v: I)
        where I: IntoIterator<Item=longhands::${shorthand}_${name}::computed_value::single_value::T>,
              I::IntoIter: ExactSizeIterator
    {
        use crate::gecko_bindings::structs::nsStyleImageLayers_LayerType as LayerType;
        let v = v.into_iter();

        unsafe {
          Gecko_EnsureImageLayersLength(&mut self.${image_layers_field}, v.len(),
                                        LayerType::${shorthand.title()});
        }

        self.${image_layers_field}.${field_name}Count = v.len() as u32;
        for (servo, geckolayer) in v.zip(self.${image_layers_field}.mLayers.iter_mut()) {
            geckolayer.${field_name} = {
                ${caller.body()}
            };
        }
    }
</%def>

<%def name="copy_simple_image_array_property(name, shorthand, layers_field_name, field_name)">
    pub fn copy_${shorthand}_${name}_from(&mut self, other: &Self) {
        use crate::gecko_bindings::structs::nsStyleImageLayers_LayerType as LayerType;

        let count = other.${layers_field_name}.${field_name}Count;
        unsafe {
            Gecko_EnsureImageLayersLength(&mut self.${layers_field_name},
                                          count as usize,
                                          LayerType::${shorthand.title()});
        }
        // FIXME(emilio): This may be bogus in the same way as bug 1426246.
        for (layer, other) in self.${layers_field_name}.mLayers.iter_mut()
                                  .zip(other.${layers_field_name}.mLayers.iter())
                                  .take(count as usize) {
            layer.${field_name} = other.${field_name}.clone();
        }
        self.${layers_field_name}.${field_name}Count = count;
    }

    pub fn reset_${shorthand}_${name}(&mut self, other: &Self) {
        self.copy_${shorthand}_${name}_from(other)
    }
</%def>

<%def name="impl_simple_image_array_property(name, shorthand, layer_field_name, field_name, struct_name)">
    <%
        ident = "%s_%s" % (shorthand, name)
        style_struct = next(x for x in data.style_structs if x.name == struct_name)
        longhand = next(x for x in style_struct.longhands if x.ident == ident)
        keyword = longhand.keyword
    %>

    <% copy_simple_image_array_property(name, shorthand, layer_field_name, field_name) %>

    pub fn set_${ident}<I>(&mut self, v: I)
    where
        I: IntoIterator<Item=longhands::${ident}::computed_value::single_value::T>,
        I::IntoIter: ExactSizeIterator,
    {
        use crate::properties::longhands::${ident}::single_value::computed_value::T as Keyword;
        use crate::gecko_bindings::structs::nsStyleImageLayers_LayerType as LayerType;

        let v = v.into_iter();

        unsafe {
          Gecko_EnsureImageLayersLength(&mut self.${layer_field_name}, v.len(),
                                        LayerType::${shorthand.title()});
        }

        self.${layer_field_name}.${field_name}Count = v.len() as u32;
        for (servo, geckolayer) in v.zip(self.${layer_field_name}.mLayers.iter_mut()) {
            geckolayer.${field_name} = {
                match servo {
                    % for value in keyword.values_for("gecko"):
                    Keyword::${to_camel_case(value)} =>
                        structs::${keyword.gecko_constant(value)} ${keyword.maybe_cast('u8')},
                    % endfor
                }
            };
        }
    }

    pub fn clone_${ident}(&self) -> longhands::${ident}::computed_value::T {
        use crate::properties::longhands::${ident}::single_value::computed_value::T as Keyword;

        % if keyword.needs_cast():
        % for value in keyword.values_for('gecko'):
        const ${keyword.casted_constant_name(value, "u8")} : u8 =
            structs::${keyword.gecko_constant(value)} as u8;
        % endfor
        % endif

        longhands::${ident}::computed_value::List(
            self.${layer_field_name}.mLayers.iter()
                .take(self.${layer_field_name}.${field_name}Count as usize)
                .map(|ref layer| {
                    match layer.${field_name} {
                        % for value in longhand.keyword.values_for("gecko"):
                        % if keyword.needs_cast():
                        ${keyword.casted_constant_name(value, "u8")}
                        % else:
                        structs::${keyword.gecko_constant(value)}
                        % endif
                            => Keyword::${to_camel_case(value)},
                        % endfor
                        % if keyword.gecko_inexhaustive:
                        _ => panic!("Found unexpected value in style struct for ${ident} property"),
                        % endif
                    }
                }).collect()
        )
    }
</%def>

<%def name="impl_common_image_layer_properties(shorthand)">
    <%
        if shorthand == "background":
            image_layers_field = "mImage"
            struct_name = "Background"
        else:
            image_layers_field = "mMask"
            struct_name = "SVG"
    %>

    <%self:simple_image_array_property name="repeat" shorthand="${shorthand}" field_name="mRepeat">
        use crate::values::specified::background::BackgroundRepeatKeyword;
        use crate::gecko_bindings::structs::nsStyleImageLayers_Repeat;
        use crate::gecko_bindings::structs::StyleImageLayerRepeat;

        fn to_ns(repeat: BackgroundRepeatKeyword) -> StyleImageLayerRepeat {
            match repeat {
                BackgroundRepeatKeyword::Repeat => StyleImageLayerRepeat::Repeat,
                BackgroundRepeatKeyword::Space => StyleImageLayerRepeat::Space,
                BackgroundRepeatKeyword::Round => StyleImageLayerRepeat::Round,
                BackgroundRepeatKeyword::NoRepeat => StyleImageLayerRepeat::NoRepeat,
            }
        }

        let repeat_x = to_ns(servo.0);
        let repeat_y = to_ns(servo.1);
        nsStyleImageLayers_Repeat {
              mXRepeat: repeat_x,
              mYRepeat: repeat_y,
        }
    </%self:simple_image_array_property>

    pub fn clone_${shorthand}_repeat(&self) -> longhands::${shorthand}_repeat::computed_value::T {
        use crate::properties::longhands::${shorthand}_repeat::single_value::computed_value::T;
        use crate::values::specified::background::BackgroundRepeatKeyword;
        use crate::gecko_bindings::structs::StyleImageLayerRepeat;

        fn to_servo(repeat: StyleImageLayerRepeat) -> BackgroundRepeatKeyword {
            match repeat {
                StyleImageLayerRepeat::Repeat => BackgroundRepeatKeyword::Repeat,
                StyleImageLayerRepeat::Space => BackgroundRepeatKeyword::Space,
                StyleImageLayerRepeat::Round => BackgroundRepeatKeyword::Round,
                StyleImageLayerRepeat::NoRepeat => BackgroundRepeatKeyword::NoRepeat,
                _ => panic!("Found unexpected value in style struct for ${shorthand}_repeat property"),
            }
        }

        longhands::${shorthand}_repeat::computed_value::List(
            self.${image_layers_field}.mLayers.iter()
                .take(self.${image_layers_field}.mRepeatCount as usize)
                .map(|ref layer| {
                    T(to_servo(layer.mRepeat.mXRepeat), to_servo(layer.mRepeat.mYRepeat))
                }).collect()
        )
    }

    <% impl_simple_image_array_property("clip", shorthand, image_layers_field, "mClip", struct_name) %>
    <% impl_simple_image_array_property("origin", shorthand, image_layers_field, "mOrigin", struct_name) %>

    % for (orientation, keyword) in [("x", "horizontal"), ("y", "vertical")]:
    pub fn copy_${shorthand}_position_${orientation}_from(&mut self, other: &Self) {
        use crate::gecko_bindings::structs::nsStyleImageLayers_LayerType as LayerType;

        let count = other.${image_layers_field}.mPosition${orientation.upper()}Count;

        unsafe {
            Gecko_EnsureImageLayersLength(&mut self.${image_layers_field},
                                          count as usize,
                                          LayerType::${shorthand.capitalize()});
        }

        for (layer, other) in self.${image_layers_field}.mLayers.iter_mut()
                                  .zip(other.${image_layers_field}.mLayers.iter())
                                  .take(count as usize) {
            layer.mPosition.${keyword} = other.mPosition.${keyword}.clone();
        }
        self.${image_layers_field}.mPosition${orientation.upper()}Count = count;
    }

    pub fn reset_${shorthand}_position_${orientation}(&mut self, other: &Self) {
        self.copy_${shorthand}_position_${orientation}_from(other)
    }

    pub fn clone_${shorthand}_position_${orientation}(&self)
        -> longhands::${shorthand}_position_${orientation}::computed_value::T {
        longhands::${shorthand}_position_${orientation}::computed_value::List(
            self.${image_layers_field}.mLayers.iter()
                .take(self.${image_layers_field}.mPosition${orientation.upper()}Count as usize)
                .map(|position| position.mPosition.${keyword}.clone())
                .collect()
        )
    }

    pub fn set_${shorthand}_position_${orientation[0]}<I>(&mut self,
                                     v: I)
        where I: IntoIterator<Item = longhands::${shorthand}_position_${orientation[0]}
                                              ::computed_value::single_value::T>,
              I::IntoIter: ExactSizeIterator
    {
        use crate::gecko_bindings::structs::nsStyleImageLayers_LayerType as LayerType;

        let v = v.into_iter();

        unsafe {
            Gecko_EnsureImageLayersLength(&mut self.${image_layers_field}, v.len(),
                                        LayerType::${shorthand.capitalize()});
        }

        self.${image_layers_field}.mPosition${orientation[0].upper()}Count = v.len() as u32;
        for (servo, geckolayer) in v.zip(self.${image_layers_field}
                                                           .mLayers.iter_mut()) {
            geckolayer.mPosition.${keyword} = servo;
        }
    }
    % endfor

    <%self:simple_image_array_property name="size" shorthand="${shorthand}" field_name="mSize">
        servo
    </%self:simple_image_array_property>

    pub fn clone_${shorthand}_size(&self) -> longhands::${shorthand}_size::computed_value::T {
        longhands::${shorthand}_size::computed_value::List(
            self.${image_layers_field}.mLayers.iter().map(|layer| layer.mSize.clone()).collect()
        )
    }

    pub fn copy_${shorthand}_image_from(&mut self, other: &Self) {
        use crate::gecko_bindings::structs::nsStyleImageLayers_LayerType as LayerType;
        unsafe {
            let count = other.${image_layers_field}.mImageCount;
            Gecko_EnsureImageLayersLength(&mut self.${image_layers_field},
                                          count as usize,
                                          LayerType::${shorthand.capitalize()});

            for (layer, other) in self.${image_layers_field}.mLayers.iter_mut()
                                      .zip(other.${image_layers_field}.mLayers.iter())
                                      .take(count as usize) {
                layer.mImage = other.mImage.clone();
            }
            self.${image_layers_field}.mImageCount = count;
        }
    }

    pub fn reset_${shorthand}_image(&mut self, other: &Self) {
        self.copy_${shorthand}_image_from(other)
    }

    #[allow(unused_variables)]
    pub fn set_${shorthand}_image<I>(&mut self, images: I)
        where I: IntoIterator<Item = longhands::${shorthand}_image::computed_value::single_value::T>,
              I::IntoIter: ExactSizeIterator
    {
        use crate::gecko_bindings::structs::nsStyleImageLayers_LayerType as LayerType;

        let images = images.into_iter();

        unsafe {
            Gecko_EnsureImageLayersLength(
                &mut self.${image_layers_field},
                images.len(),
                LayerType::${shorthand.title()},
            );
        }

        self.${image_layers_field}.mImageCount = images.len() as u32;
        for (image, geckoimage) in images.zip(self.${image_layers_field}
                                                  .mLayers.iter_mut()) {
            geckoimage.mImage = image;
        }
    }

    pub fn clone_${shorthand}_image(&self) -> longhands::${shorthand}_image::computed_value::T {
        longhands::${shorthand}_image::computed_value::List(
            self.${image_layers_field}.mLayers.iter()
                .take(self.${image_layers_field}.mImageCount as usize)
                .map(|layer| layer.mImage.clone())
                .collect()
        )
    }

    <%
        fill_fields = "mRepeat mClip mOrigin mPositionX mPositionY mImage mSize"
        if shorthand == "background":
            fill_fields += " mAttachment mBlendMode"
        else:
            # mSourceURI uses mImageCount
            fill_fields += " mMaskMode mComposite"
    %>
    pub fn fill_arrays(&mut self) {
        use crate::gecko_bindings::bindings::Gecko_FillAllImageLayers;
        use std::cmp;
        let mut max_len = 1;
        % for member in fill_fields.split():
            max_len = cmp::max(max_len, self.${image_layers_field}.${member}Count);
        % endfor
        unsafe {
            // While we could do this manually, we'd need to also manually
            // run all the copy constructors, so we just delegate to gecko
            Gecko_FillAllImageLayers(&mut self.${image_layers_field}, max_len);
        }
    }
</%def>

// TODO: Gecko accepts lists in most background-related properties. We just use
// the first element (which is the common case), but at some point we want to
// add support for parsing these lists in servo and pushing to nsTArray's.
<% skip_background_longhands = """background-repeat
                                  background-image background-clip
                                  background-origin background-attachment
                                  background-size background-position
                                  background-blend-mode
                                  background-position-x
                                  background-position-y""" %>
<%self:impl_trait style_struct_name="Background"
                  skip_longhands="${skip_background_longhands}">

    <% impl_common_image_layer_properties("background") %>
    <% impl_simple_image_array_property("attachment", "background", "mImage", "mAttachment", "Background") %>
    <% impl_simple_image_array_property("blend_mode", "background", "mImage", "mBlendMode", "Background") %>
</%self:impl_trait>

<%self:impl_trait style_struct_name="List">
</%self:impl_trait>

<%self:impl_trait style_struct_name="Table">
</%self:impl_trait>

<%self:impl_trait style_struct_name="Effects">
</%self:impl_trait>

<%self:impl_trait style_struct_name="InheritedBox">
</%self:impl_trait>

<%self:impl_trait style_struct_name="InheritedTable">
</%self:impl_trait>

<%self:impl_trait style_struct_name="InheritedText">
</%self:impl_trait>

<%self:impl_trait style_struct_name="Text">
</%self:impl_trait>

<% skip_svg_longhands = """
mask-mode mask-repeat mask-clip mask-origin mask-composite mask-position-x mask-position-y mask-size mask-image
"""
%>
<%self:impl_trait style_struct_name="SVG"
                  skip_longhands="${skip_svg_longhands}">
    <% impl_common_image_layer_properties("mask") %>
    <% impl_simple_image_array_property("mode", "mask", "mMask", "mMaskMode", "SVG") %>
    <% impl_simple_image_array_property("composite", "mask", "mMask", "mComposite", "SVG") %>
</%self:impl_trait>

<%self:impl_trait style_struct_name="InheritedSVG">
</%self:impl_trait>

<%self:impl_trait style_struct_name="InheritedUI">
    #[inline]
    pub fn color_scheme_bits(&self) -> values::specified::color::ColorSchemeFlags {
        self.mColorScheme.bits
    }
</%self:impl_trait>

<%self:impl_trait style_struct_name="Column"
                  skip_longhands="column-rule-width column-rule-style">
    pub fn set_column_rule_style(&mut self, v: longhands::column_rule_style::computed_value::T) {
        self.mColumnRuleStyle = v;
        // NB: This is needed to correctly handling the initial value of
        // column-rule-width when colun-rule-style changes, see the
        // update_border_${side.ident} comment for more details.
        self.mActualColumnRuleWidth = self.mColumnRuleWidth;
    }

    pub fn copy_column_rule_style_from(&mut self, other: &Self) {
        self.set_column_rule_style(other.mColumnRuleStyle);
    }

    pub fn reset_column_rule_style(&mut self, other: &Self) {
        self.copy_column_rule_style_from(other)
    }

    pub fn clone_column_rule_style(&self) -> longhands::column_rule_style::computed_value::T {
        self.mColumnRuleStyle.clone()
    }

    ${impl_border_width("column_rule_width", "mActualColumnRuleWidth", "mColumnRuleWidth")}

    pub fn column_rule_has_nonzero_width(&self) -> bool {
        self.mActualColumnRuleWidth != 0
    }
</%self:impl_trait>

<%self:impl_trait style_struct_name="Counters">
    pub fn ineffective_content_property(&self) -> bool {
        !self.mContent.is_items()
    }
</%self:impl_trait>

<% skip_ui_longhands = """animation-name animation-delay animation-duration
                          animation-direction animation-fill-mode
                          animation-play-state animation-iteration-count
                          animation-timing-function animation-composition animation-timeline
                          transition-behavior transition-duration transition-delay
                          transition-timing-function transition-property
                          scroll-timeline-name scroll-timeline-axis
                          view-timeline-name view-timeline-axis view-timeline-inset""" %>

<%self:impl_trait style_struct_name="UI" skip_longhands="${skip_ui_longhands}">
    ${impl_coordinated_property('transition', 'behavior', 'Behavior')}
    ${impl_coordinated_property('transition', 'delay', 'Delay')}
    ${impl_coordinated_property('transition', 'duration', 'Duration')}
    ${impl_coordinated_property('transition', 'timing_function', 'TimingFunction')}
    ${impl_coordinated_property('transition', 'property', 'Property')}

    pub fn transition_combined_duration_at(&self, index: usize) -> Time {
        // https://drafts.csswg.org/css-transitions/#transition-combined-duration
        Time::from_seconds(
            self.transition_duration_at(index).seconds().max(0.0) +
            self.transition_delay_at(index).seconds()
        )
    }

    /// Returns whether there are any transitions specified.
    pub fn specifies_transitions(&self) -> bool {
        if self.mTransitionPropertyCount == 1 &&
            self.transition_combined_duration_at(0).seconds() <= 0.0f32 {
            return false;
        }
        self.mTransitionPropertyCount > 0
    }

    /// Returns whether animation-timeline is initial value. We need this information to resolve
    /// animation-duration.
    pub fn has_initial_animation_timeline(&self) -> bool {
        self.mAnimationTimelineCount == 1 && self.animation_timeline_at(0).is_auto()
    }

    pub fn animations_equals(&self, other: &Self) -> bool {
        return self.mAnimationNameCount == other.mAnimationNameCount
            && self.mAnimationDelayCount == other.mAnimationDelayCount
            && self.mAnimationDirectionCount == other.mAnimationDirectionCount
            && self.mAnimationDurationCount == other.mAnimationDurationCount
            && self.mAnimationFillModeCount == other.mAnimationFillModeCount
            && self.mAnimationIterationCountCount == other.mAnimationIterationCountCount
            && self.mAnimationPlayStateCount == other.mAnimationPlayStateCount
            && self.mAnimationTimingFunctionCount == other.mAnimationTimingFunctionCount
            && self.mAnimationCompositionCount == other.mAnimationCompositionCount
            && self.mAnimationTimelineCount == other.mAnimationTimelineCount
            && unsafe { bindings::Gecko_StyleAnimationsEquals(&self.mAnimations, &other.mAnimations) }
    }

    ${impl_coordinated_property('animation', 'name', 'Name')}
    ${impl_coordinated_property('animation', 'delay', 'Delay')}
    ${impl_coordinated_property('animation', 'duration', 'Duration')}
    ${impl_coordinated_property('animation', 'direction', 'Direction')}
    ${impl_coordinated_property('animation', 'fill_mode', 'FillMode')}
    ${impl_coordinated_property('animation', 'play_state', 'PlayState')}
    ${impl_coordinated_property('animation', 'composition', 'Composition')}
    ${impl_coordinated_property('animation', 'iteration_count', 'IterationCount')}
    ${impl_coordinated_property('animation', 'timeline', 'Timeline')}
    ${impl_coordinated_property('animation', 'timing_function', 'TimingFunction')}

    ${impl_coordinated_property('scroll_timeline', 'name', 'Name')}
    ${impl_coordinated_property('scroll_timeline', 'axis', 'Axis')}

    pub fn scroll_timelines_equals(&self, other: &Self) -> bool {
        self.mScrollTimelineNameCount == other.mScrollTimelineNameCount
            && self.mScrollTimelineAxisCount == other.mScrollTimelineAxisCount
            && unsafe {
                bindings::Gecko_StyleScrollTimelinesEquals(
                    &self.mScrollTimelines,
                    &other.mScrollTimelines,
                )
            }
    }

    ${impl_coordinated_property('view_timeline', 'name', 'Name')}
    ${impl_coordinated_property('view_timeline', 'axis', 'Axis')}
    ${impl_coordinated_property('view_timeline', 'inset', 'Inset')}

    pub fn view_timelines_equals(&self, other: &Self) -> bool {
        self.mViewTimelineNameCount == other.mViewTimelineNameCount
            && self.mViewTimelineAxisCount == other.mViewTimelineAxisCount
            && self.mViewTimelineInsetCount == other.mViewTimelineInsetCount
            && unsafe {
                bindings::Gecko_StyleViewTimelinesEquals(
                    &self.mViewTimelines,
                    &other.mViewTimelines,
                )
            }
    }
</%self:impl_trait>

<%self:impl_trait style_struct_name="XUL">
</%self:impl_trait>

% for style_struct in data.style_structs:
${impl_style_struct(style_struct)}
% endfor

/// Assert that the initial values set in Gecko style struct constructors
/// match the values returned by `get_initial_value()` for each longhand.
#[cfg(feature = "gecko")]
#[inline]
pub fn assert_initial_values_match(data: &PerDocumentStyleData) {
    if cfg!(debug_assertions) {
        let data = data.borrow();
        let cv = data.stylist.device().default_computed_values();
        <%
            # Skip properties with initial values that change at computed
            # value time, or whose initial value depends on the document
            # / other prefs.
            SKIPPED = [
                "border-top-width",
                "border-bottom-width",
                "border-left-width",
                "border-right-width",
                "column-rule-width",
                "font-family",
                "font-size",
                "outline-width",
                "color",
            ]
            TO_TEST = [p for p in data.longhands if p.enabled_in != "" and not p.logical and not p.name in SKIPPED]
        %>
        % for property in TO_TEST:
        assert_eq!(
            cv.clone_${property.ident}(),
            longhands::${property.ident}::get_initial_value(),
            concat!(
                "initial value in Gecko style struct for ",
                stringify!(${property.ident}),
                " must match longhands::",
                stringify!(${property.ident}),
                "::get_initial_value()"
            )
        );
        % endfor
    }
}
